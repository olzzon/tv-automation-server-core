import { RundownPlaylistId, RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { ClientAPI } from '../../../lib/api/client'
import {
	getCurrentTime,
	waitForPromise,
	unprotectObjectArray,
	protectString,
	literal,
	clone,
	getRandomId,
} from '../../../lib/lib'
import { rundownPlaylistSyncFunction, RundownSyncFunctionPriority } from '../ingest/rundownInput'
import { Meteor } from 'meteor/meteor'
import { initCacheForRundownPlaylist, CacheForRundownPlaylist } from '../../DatabaseCaches'
import {
	setNextPart as libsetNextPart,
	getSelectedPartInstancesFromCache,
	isTooCloseToAutonext,
	getSegmentsAndPartsFromCache,
	selectNextPart,
	getAllPieceInstancesFromCache,
} from './lib'
import { loadShowStyleBlueprint } from '../blueprints/cache'
import { RundownHoldState, Rundown, Rundowns } from '../../../lib/collections/Rundowns'
import { updateTimeline } from './timeline'
import { logger } from '../../logging'
import { PartEndState, ShowStyleBlueprintManifest, VTContent } from '@sofie-automation/blueprints-integration'
import { getResolvedPieces } from './pieces'
import * as _ from 'underscore'
import {
	PieceInstance,
	PieceInstanceId,
	PieceInstanceInfiniteId,
	PieceInstances,
} from '../../../lib/collections/PieceInstances'
import { PartEventContext, RundownContext } from '../blueprints/context/context'
import { PartInstance, PartInstanceId } from '../../../lib/collections/PartInstances'
import { IngestActions } from '../ingest/actions'
import { StudioId } from '../../../lib/collections/Studios'
import { PeripheralDeviceAPI } from '../../../lib/api/peripheralDevice'
import { reportPartHasStarted } from '../asRunLog'
import { MethodContext } from '../../../lib/api/methods'
import { profiler } from '../profiler'
import { ServerPlayoutAdLibAPI } from './adlib'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { isAnySyncFunctionsRunning } from '../../codeControl'
import { checkAccessAndGetPlaylist } from '../lib'
import { ShowStyleCompound } from '../../../lib/collections/ShowStyleVariants'

export function takeNextPartInner(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	existingCache?: CacheForRundownPlaylist
): ClientAPI.ClientResponse<void> {
	let now = getCurrentTime()

	return rundownPlaylistSyncFunction(
		rundownPlaylistId,
		RundownSyncFunctionPriority.USER_PLAYOUT,
		'takeNextPartInner',
		() => {
			return takeNextPartInnerSync(context, rundownPlaylistId, now, existingCache)
		}
	)
}

/**
 * This *must* be run within a rundownPlaylistSyncFunction.
 * It is exposed to prevent nested sync functions where take is called as part of another action.
 */
export function takeNextPartInnerSync(
	context: MethodContext,
	rundownPlaylistId: RundownPlaylistId,
	now: number,
	existingCache?: CacheForRundownPlaylist
) {
	const span = profiler.startSpan('takeNextPartInner')
	let cache: CacheForRundownPlaylist | undefined = existingCache

	if (!cache) {
		const dbPlaylist = checkAccessAndGetPlaylist(context, rundownPlaylistId)
		cache = waitForPromise(initCacheForRundownPlaylist(dbPlaylist, undefined, true))
	}

	let playlist = cache.RundownPlaylists.findOne(rundownPlaylistId)
	if (!playlist) throw new Meteor.Error(404, `Rundown Playlist "${rundownPlaylistId}" not found in cache!`)
	if (!playlist.active) throw new Meteor.Error(501, `RundownPlaylist "${rundownPlaylistId}" is not active!`)
	if (!playlist.nextPartInstanceId) throw new Meteor.Error(500, 'nextPartInstanceId is not set!')

	let timeOffset: number | null = playlist.nextTimeOffset || null
	let firstTake = !playlist.startedPlayback

	const { currentPartInstance, nextPartInstance, previousPartInstance } = getSelectedPartInstancesFromCache(
		cache,
		playlist
	)
	// const partInstance = nextPartInstance || currentPartInstance
	const partInstance = nextPartInstance // todo: we should always take the next, so it's this one, right?
	if (!partInstance) throw new Meteor.Error(404, `No partInstance could be found!`)
	const currentRundown = partInstance ? cache.Rundowns.findOne(partInstance.rundownId) : undefined
	if (!currentRundown)
		throw new Meteor.Error(404, `Rundown "${(partInstance && partInstance.rundownId) || ''}" could not be found!`)

	let pShowStyle = cache.activationCache.getShowStyleBase(currentRundown)
	let pBlueprint = pShowStyle.then((showStyle) => loadShowStyleBlueprint(showStyle))

	if (currentPartInstance) {
		const allowTransition = previousPartInstance && !previousPartInstance.part.disableOutTransition
		const start = currentPartInstance.timings?.startedPlayback

		// If there was a transition from the previous Part, then ensure that has finished before another take is permitted
		if (
			allowTransition &&
			currentPartInstance.part.transitionDuration &&
			start &&
			now < start + currentPartInstance.part.transitionDuration
		) {
			return ClientAPI.responseError('Cannot take during a transition')
		}

		if (isTooCloseToAutonext(currentPartInstance, true)) {
			return ClientAPI.responseError('Cannot take shortly before an autoTake')
		}
	}

	if (playlist.holdState === RundownHoldState.COMPLETE) {
		cache.RundownPlaylists.update(playlist._id, {
			$set: {
				holdState: RundownHoldState.NONE,
			},
		})
		// If hold is active, then this take is to clear it
	} else if (playlist.holdState === RundownHoldState.ACTIVE) {
		completeHold(cache, playlist, waitForPromise(pShowStyle), currentPartInstance)

		waitForPromise(cache.saveAllToDatabase())

		return ClientAPI.responseSuccess(undefined)
	}

	const takePartInstance = nextPartInstance
	if (!takePartInstance) throw new Meteor.Error(404, 'takePart not found!')
	const takeRundown: Rundown | undefined = cache.Rundowns.findOne(takePartInstance.rundownId)
	if (!takeRundown)
		throw new Meteor.Error(500, `takeRundown: takeRundown not found! ("${takePartInstance.rundownId}")`)

	const { segments, parts: partsInOrder } = getSegmentsAndPartsFromCache(cache, playlist)
	// let takeSegment = rundownData.segmentsMap[takePart.segmentId]
	const nextPart = selectNextPart(playlist, takePartInstance, partsInOrder)

	// beforeTake(rundown, previousPart || null, takePart)

	const { blueprint } = waitForPromise(pBlueprint)
	if (blueprint.onPreTake) {
		const span = profiler.startSpan('blueprint.onPreTake')
		try {
			waitForPromise(
				Promise.resolve(blueprint.onPreTake(new PartEventContext(takeRundown, cache, takePartInstance))).catch(
					logger.error
				)
			)
			if (span) span.end()
		} catch (e) {
			if (span) span.end()
			logger.error(e)
		}
	}

	updatePartInstanceOnTake(cache, playlist, pShowStyle, blueprint, takeRundown, takePartInstance, currentPartInstance)

	const m: Partial<RundownPlaylist> = {
		previousPartInstanceId: playlist.currentPartInstanceId,
		currentPartInstanceId: takePartInstance._id,
		holdState:
			!playlist.holdState || playlist.holdState === RundownHoldState.COMPLETE
				? RundownHoldState.NONE
				: playlist.holdState + 1,
	}

	cache.RundownPlaylists.update(playlist._id, {
		$set: m,
	})

	cache.PartInstances.update(takePartInstance._id, {
		$set: {
			isTaken: true,
			'timings.take': now,
			'timings.playOffset': timeOffset || 0,
		},
	})

	if (m.previousPartInstanceId) {
		cache.PartInstances.update(m.previousPartInstanceId, {
			$set: {
				'timings.takeOut': now,
			},
		})
	}
	playlist = _.extend(playlist, m) as RundownPlaylist

	const resetPartInstanceWithPieceInstances = (cache: CacheForRundownPlaylist, partInstanceId: PartInstanceId) => {
		cache.PartInstances.update(partInstanceId, {
			$set: {
				reset: true,
			},
		})
		cache.deferAfterSave(() => {
			PieceInstances.update(
				{
					partInstanceId: partInstanceId,
				},
				{
					$set: {
						reset: true,
					},
				},
				{
					multi: true,
				}
			)
		})
	}

	// Reset old PartInstances and PieceInstances of the taken Part, that were excluded from resetting in setNextPart:
	if (currentPartInstance?.part._id === takePartInstance.part._id) {
		resetPartInstanceWithPieceInstances(cache, currentPartInstance._id)
	}
	if (previousPartInstance?.part._id === takePartInstance.part._id) {
		resetPartInstanceWithPieceInstances(cache, previousPartInstance._id)
	}

	// Once everything is synced, we can choose the next part
	libsetNextPart(cache, playlist, nextPart ? nextPart.part : null)

	// update playoutData
	// const newSelectedPartInstances = playlist.getSelectedPartInstances()
	// rundownData = {
	// 	...rundownData,
	// 	...newSelectedPartInstances
	// }
	// rundownData = getAllOrderedPartsFromCache(cache, playlist) // this is not needed anymore

	// Setup the parts for the HOLD we are starting
	if (playlist.previousPartInstanceId && m.holdState === RundownHoldState.ACTIVE) {
		startHold(cache, currentPartInstance, nextPartInstance)
	}
	afterTake(cache, playlist.studioId, takePartInstance, timeOffset)

	// Last:
	const takeDoneTime = getCurrentTime()
	cache.defer((cache) => {
		// todo: should this be changed back to Meteor.defer, at least for the blueprint stuff?
		if (takePartInstance) {
			cache.PartInstances.update(takePartInstance._id, {
				$set: {
					'timings.takeDone': takeDoneTime,
				},
			})

			// Simulate playout, if no gateway
			if (takePartInstance) {
				const playoutDevices = waitForPromise(cache.activationCache.getPeripheralDevices()).filter(
					(d) => d.studioId === takeRundown.studioId && d.type === PeripheralDeviceAPI.DeviceType.PLAYOUT
				)
				if (playoutDevices.length === 0) {
					logger.info(
						`No Playout gateway attached to studio, reporting PartInstance "${
							takePartInstance._id
						}" to have started playback on timestamp ${new Date(takeDoneTime).toISOString()}`
					)
					reportPartHasStarted(cache, takePartInstance, takeDoneTime)
				}
			}

			// let bp = getBlueprintOfRundown(rundown)
			if (firstTake) {
				if (blueprint.onRundownFirstTake) {
					const span = profiler.startSpan('blueprint.onRundownFirstTake')
					waitForPromise(
						Promise.resolve(
							blueprint.onRundownFirstTake(new PartEventContext(takeRundown, cache, takePartInstance))
						).catch(logger.error)
					)
					if (span) span.end()
				}
			}

			if (blueprint.onPostTake) {
				const span = profiler.startSpan('blueprint.onPostTake')
				waitForPromise(
					Promise.resolve(
						blueprint.onPostTake(new PartEventContext(takeRundown, cache, takePartInstance))
					).catch(logger.error)
				)
				if (span) span.end()
			}
		}
	})
	waitForPromise(cache.saveAllToDatabase())

	if (span) span.end()
	return ClientAPI.responseSuccess(undefined)
}

export function updatePartInstanceOnTake(
	cache: CacheForRundownPlaylist,
	playlist: RundownPlaylist,
	pShowStyle: Promise<ShowStyleBase>,
	blueprint: ShowStyleBlueprintManifest,
	takeRundown: Rundown,
	takePartInstance: PartInstance,
	currentPartInstance: PartInstance | undefined
): void {
	// TODO - the state could change after this sampling point. This should be handled properly
	let previousPartEndState: PartEndState | undefined = undefined
	if (blueprint.getEndStateForPart && currentPartInstance) {
		const time = getCurrentTime()
		const showStyle = waitForPromise(pShowStyle)
		if (showStyle) {
			const resolvedPieces = getResolvedPieces(cache, showStyle, currentPartInstance)

			const span = profiler.startSpan('blueprint.getEndStateForPart')
			const context = new RundownContext(takeRundown, cache, undefined)
			previousPartEndState = blueprint.getEndStateForPart(
				context,
				playlist.previousPersistentState,
				currentPartInstance.previousPartEndState,
				unprotectObjectArray(resolvedPieces),
				time
			)
			if (span) span.end()
			logger.info(`Calculated end state in ${getCurrentTime() - time}ms`)
		}
	}

	let partInstanceM: any = {
		$set: {
			isTaken: true,
			// set transition properties to what will be used to generate timeline later:
			allowedToUseTransition: currentPartInstance && !currentPartInstance.part.disableOutTransition,
		},
	}
	if (previousPartEndState) {
		partInstanceM.$set.previousPartEndState = previousPartEndState
	}

	cache.PartInstances.update(takePartInstance._id, partInstanceM)
}

export function afterTake(
	cache: CacheForRundownPlaylist,
	studioId: StudioId,
	takePartInstance: PartInstance,
	timeOffset: number | null = null
) {
	const span = profiler.startSpan('afterTake')
	// This function should be called at the end of a "take" event (when the Parts have been updated)

	let forceNowTime: number | undefined = undefined
	if (timeOffset) {
		forceNowTime = getCurrentTime() - timeOffset
	}
	// or after a new part has started playing
	updateTimeline(cache, studioId, forceNowTime)

	// defer these so that the playout gateway has the chance to learn about the changes
	Meteor.setTimeout(() => {
		// todo
		if (takePartInstance.part.shouldNotifyCurrentPlayingPart) {
			const currentRundown = Rundowns.findOne(takePartInstance.rundownId)
			if (!currentRundown)
				throw new Meteor.Error(
					404,
					`Rundown "${takePartInstance.rundownId}" of partInstance "${takePartInstance._id}" not found`
				)
			IngestActions.notifyCurrentPlayingPart(currentRundown, takePartInstance.part)
		}
	}, 40)

	triggerGarbageCollection()
	if (span) span.end()
}

/**
 * A Hold starts by extending the "extendOnHold"-able pieces in the previous Part.
 */
function startHold(
	cache: CacheForRundownPlaylist,
	holdFromPartInstance: PartInstance | undefined,
	holdToPartInstance: PartInstance | undefined
) {
	if (!holdFromPartInstance) throw new Meteor.Error(404, 'previousPart not found!')
	if (!holdToPartInstance) throw new Meteor.Error(404, 'currentPart not found!')
	const span = profiler.startSpan('startHold')

	// Make a copy of any item which is flagged as an 'infinite' extension
	const itemsToCopy = getAllPieceInstancesFromCache(cache, holdFromPartInstance).filter((pi) => pi.piece.extendOnHold)
	itemsToCopy.forEach((instance) => {
		if (!instance.infinite) {
			const infiniteInstanceId: PieceInstanceInfiniteId = getRandomId()
			// mark current one as infinite
			cache.PieceInstances.update(instance._id, {
				$set: {
					infinite: {
						infiniteInstanceId: infiniteInstanceId,
						infinitePieceId: instance.piece._id,
						fromPreviousPart: false,
					},
				},
			})

			// make the extension
			const newInstance = literal<PieceInstance>({
				_id: protectString<PieceInstanceId>(instance._id + '_hold'),
				rundownId: instance.rundownId,
				partInstanceId: holdToPartInstance._id,
				dynamicallyInserted: getCurrentTime(),
				piece: {
					...clone(instance.piece),
					enable: { start: 0 },
					extendOnHold: false,
				},
				infinite: {
					infiniteInstanceId: infiniteInstanceId,
					infinitePieceId: instance.piece._id,
					fromPreviousPart: true,
					fromHold: true,
				},
				// Preserve the timings from the playing instance
				startedPlayback: instance.startedPlayback,
				stoppedPlayback: instance.stoppedPlayback,
			})
			const content = newInstance.piece.content as VTContent | undefined
			if (content && content.fileName && content.sourceDuration && instance.startedPlayback) {
				content.seek = Math.min(content.sourceDuration, getCurrentTime() - instance.startedPlayback)
			}

			// This gets deleted once the nextpart is activated, so it doesnt linger for long
			cache.PieceInstances.upsert(newInstance._id, newInstance)
		}
	})
	if (span) span.end()
}

function completeHold(
	cache: CacheForRundownPlaylist,
	playlist: RundownPlaylist,
	showStyleBase: ShowStyleBase,
	currentPartInstance: PartInstance | undefined
) {
	cache.RundownPlaylists.update(playlist._id, {
		$set: {
			holdState: RundownHoldState.COMPLETE,
		},
	})

	if (playlist.currentPartInstanceId) {
		if (!currentPartInstance) throw new Meteor.Error(404, 'currentPart not found!')

		// Clear the current extension line
		ServerPlayoutAdLibAPI.innerStopPieces(
			cache,
			showStyleBase,
			currentPartInstance,
			(p) => !!p.infinite?.fromHold,
			undefined
		)
	}

	updateTimeline(cache, playlist.studioId)
}

export function triggerGarbageCollection() {
	Meteor.setTimeout(() => {
		// Trigger a manual garbage collection:
		if (global.gc) {
			// This is only avaialble of the flag --expose_gc
			// This can be done in prod by: node --expose_gc main.js
			// or when running Meteor in development, set set SERVER_NODE_OPTIONS=--expose_gc

			if (!isAnySyncFunctionsRunning()) {
				// by passing true, we're triggering the "full" collection
				// @ts-ignore (typings not avaiable)
				global.gc(true)
			}
		}
	}, 500)
}
