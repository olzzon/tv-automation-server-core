import { check } from '../../lib/check'
import { Meteor } from 'meteor/meteor'
import {
	ExpectedMediaItems,
	ExpectedMediaItem,
	ExpectedMediaItemId,
	ExpectedMediaItemBucketPiece,
	ExpectedMediaItemBucketAction,
	ExpectedMediaItemBase,
	ExpectedMediaItemRundown,
} from '../../lib/collections/ExpectedMediaItems'
import { RundownId } from '../../lib/collections/Rundowns'
import { Piece, PieceGeneric, PieceId } from '../../lib/collections/Pieces'
import { AdLibPiece, AdLibPieces } from '../../lib/collections/AdLibPieces'
import { syncFunctionIgnore } from '../codeControl'
import {
	saveIntoDb,
	getCurrentTime,
	getHash,
	protectString,
	asyncCollectionRemove,
	waitForPromise,
	ProtectedString,
	literal,
	unprotectString,
} from '../../lib/lib'
import { PartId } from '../../lib/collections/Parts'
import { logger } from '../logging'
import { BucketAdLibs } from '../../lib/collections/BucketAdlibs'
import { StudioId } from '../../lib/collections/Studios'
import { CacheForRundownPlaylist } from '../DatabaseCaches'
import { AdLibAction, AdLibActionId, AdLibActions } from '../../lib/collections/AdLibActions'
import {
	IBlueprintActionManifestDisplay,
	IBlueprintActionManifestDisplayContent,
	PieceLifespan,
	SomeContent,
	VTContent,
} from '@sofie-automation/blueprints-integration'
import { BucketAdLibActions } from '../../lib/collections/BucketAdlibActions'
import { Subtract } from 'utility-types'
import { RundownAPI } from '../../lib/api/rundown'
import {
	RundownBaselineAdLibAction,
	RundownBaselineAdLibActions,
} from '../../lib/collections/RundownBaselineAdLibActions'
import { RundownBaselineAdLibPieces } from '../../lib/collections/RundownBaselineAdLibPieces'

export enum PieceType {
	PIECE = 'piece',
	ADLIB = 'adlib',
	ACTION = 'action',
}

// TODO-PartInstance generate these for when the part has no need, but the instance still references something

function generateExpectedMediaItems<T extends ExpectedMediaItemBase>(
	sourceId: ProtectedString<any>,
	commonProps: Subtract<T, ExpectedMediaItemBase>,
	studioId: StudioId,
	label: string,
	content: SomeContent | undefined,
	pieceType: string
): T[] {
	const result: T[] = []

	const pieceContent = content as Partial<VTContent> | undefined
	if (pieceContent && pieceContent.fileName && pieceContent.path && pieceContent.mediaFlowIds) {
		for (const flow of pieceContent.mediaFlowIds) {
			const id = protectString<ExpectedMediaItemId>(
				getHash(pieceType + '_' + sourceId + '_' + JSON.stringify(commonProps) + '_' + flow)
			)
			const baseObj: ExpectedMediaItemBase = {
				_id: id,
				studioId: studioId,
				label: label,
				disabled: false,
				lastSeen: getCurrentTime(),
				mediaFlowId: flow,
				path: pieceContent.fileName,
				url: pieceContent.path,
				previewFrame: pieceContent.previewFrame,
			}
			result.push({
				...commonProps,
				...baseObj,
			} as T)
		}
	}

	return result
}

function generateExpectedMediaItemsFull(
	studioId: StudioId,
	rundownId: RundownId,
	pieces: Piece[],
	adlibs: AdLibPiece[],
	actions: Array<RundownBaselineAdLibAction | AdLibAction>
): ExpectedMediaItem[] {
	const eMIs: ExpectedMediaItem[] = []

	pieces.forEach((doc) =>
		eMIs.push(
			...generateExpectedMediaItems<ExpectedMediaItemRundown>(
				doc._id,
				{
					partId: doc.startPartId,
					rundownId: doc.startRundownId,
				},
				studioId,
				doc.name,
				doc.content,
				PieceType.PIECE
			)
		)
	)
	adlibs.forEach((doc) =>
		eMIs.push(
			...generateExpectedMediaItems<ExpectedMediaItemRundown>(
				doc._id,
				{
					partId: doc.partId,
					rundownId: rundownId,
				},
				studioId,
				doc.name,
				doc.content,
				PieceType.ADLIB
			)
		)
	)
	actions.forEach((doc) =>
		eMIs.push(
			...generateExpectedMediaItems<ExpectedMediaItemRundown>(
				doc._id,
				{
					partId: doc.partId,
					rundownId: rundownId,
				},
				studioId,
				doc.display.label,
				(doc.display as IBlueprintActionManifestDisplayContent | undefined)?.content,
				PieceType.ACTION
			)
		)
	)

	return eMIs
}

export async function cleanUpExpectedMediaItemForBucketAdLibPiece(adLibIds: PieceId[]): Promise<void> {
	check(adLibIds, [String])

	const removedItems = await asyncCollectionRemove(ExpectedMediaItems, {
		bucketAdLibPieceId: {
			$in: adLibIds,
		},
	})

	logger.info(`Removed ${removedItems} expected media items for deleted bucket adLib items`)
}

export async function cleanUpExpectedMediaItemForBucketAdLibActions(actionIds: AdLibActionId[]): Promise<void> {
	check(actionIds, [String])

	const removedItems = await asyncCollectionRemove(ExpectedMediaItems, {
		bucketAdLibActionId: {
			$in: actionIds,
		},
	})

	logger.info(`Removed ${removedItems} expected media items for deleted bucket adLib actions`)
}

export function updateExpectedMediaItemForBucketAdLibPiece(adLibId: PieceId): void {
	check(adLibId, String)

	const piece = BucketAdLibs.findOne(adLibId)
	if (!piece) {
		waitForPromise(cleanUpExpectedMediaItemForBucketAdLibPiece([adLibId]))
		throw new Meteor.Error(404, `Bucket AdLib "${adLibId}" not found!`)
	}

	const result = generateExpectedMediaItems<ExpectedMediaItemBucketPiece>(
		piece._id,
		{
			bucketId: piece.bucketId,
			bucketAdLibPieceId: piece._id,
		},
		piece.studioId,
		piece.name,
		piece.content,
		PieceType.ADLIB
	)

	saveIntoDb(
		ExpectedMediaItems,
		{
			bucketAdLibPieceId: adLibId,
		},
		result
	)
}

export function updateExpectedMediaItemForBucketAdLibAction(actionId: AdLibActionId): void {
	check(actionId, String)

	const action = BucketAdLibActions.findOne(actionId)
	if (!action) {
		waitForPromise(cleanUpExpectedMediaItemForBucketAdLibActions([actionId]))
		throw new Meteor.Error(404, `Bucket Action "${actionId}" not found!`)
	}

	const result = generateExpectedMediaItems<ExpectedMediaItemBucketAction>(
		action._id,
		{
			bucketId: action.bucketId,
			bucketAdLibActionId: action._id,
		},
		action.studioId,
		action.display.label,
		(action.display as IBlueprintActionManifestDisplayContent | undefined)?.content,
		PieceType.ADLIB
	)

	saveIntoDb(
		ExpectedMediaItems,
		{
			bucketAdLibActionId: actionId,
		},
		result
	)
}

export function updateExpectedMediaItemsOnRundown(cache: CacheForRundownPlaylist, rundownId: RundownId): void {
	check(rundownId, String)

	const rundown = cache.Rundowns.findOne(rundownId)
	if (!rundown) {
		cache.deferAfterSave(() => {
			const removedItems = ExpectedMediaItems.remove({
				rundownId: rundownId,
			})
			logger.info(`Removed ${removedItems} expected media items for deleted rundown "${rundownId}"`)
		})
		return
	}
	const studioId = rundown.studioId

	cache.deferAfterSave(() => {
		const pieces = cache.Pieces.findFetch({
			startRundownId: rundown._id,
		})

		const adlibs = AdLibPieces.find({
			rundownId: rundown._id,
		}).fetch()

		const baselineAdlibs = RundownBaselineAdLibPieces.find({
			rundownId: rundown._id,
		}).fetch()

		const actions = AdLibActions.find({
			rundownId: rundown._id,
		}).fetch()

		const baselineActions = RundownBaselineAdLibActions.find({
			rundownId: rundown._id,
		}).fetch()

		const eMIs = generateExpectedMediaItemsFull(
			studioId,
			rundownId,
			pieces,
			[...baselineAdlibs, ...adlibs],
			[...baselineActions, ...actions]
		)

		saveIntoDb<ExpectedMediaItem, ExpectedMediaItem>(
			ExpectedMediaItems,
			{
				rundownId: rundown._id,
			},
			eMIs
		)
	})
}

// TEMP: Tests fail if the function is imported from the UI
export interface AdLibPieceUi extends AdLibPiece {
	hotkey?: string
	isGlobal?: boolean
	isHidden?: boolean
	isSticky?: boolean
	isAction?: boolean
	isClearSourceLayer?: boolean
	adlibAction?: AdLibAction | RundownBaselineAdLibAction
}

export function isAdlibActionContent(
	display: IBlueprintActionManifestDisplay | IBlueprintActionManifestDisplayContent
): display is IBlueprintActionManifestDisplayContent {
	if ((display as any).sourceLayerId !== undefined) {
		return true
	}
	return false
}

export function actionToAdLibPieceUi(action: AdLibAction | RundownBaselineAdLibAction): AdLibPieceUi {
	let sourceLayerId = ''
	let outputLayerId = ''
	let content: Omit<SomeContent, 'timelineObject'> | undefined = undefined
	const isContent = isAdlibActionContent(action.display)
	if (isContent) {
		sourceLayerId = (action.display as IBlueprintActionManifestDisplayContent).sourceLayerId
		outputLayerId = (action.display as IBlueprintActionManifestDisplayContent).outputLayerId
		content = (action.display as IBlueprintActionManifestDisplayContent).content
	}

	return literal<AdLibPieceUi>({
		_id: protectString(`function_${action._id}`),
		name: action.display.label,
		status: RundownAPI.PieceStatusCode.UNKNOWN,
		isAction: true,
		expectedDuration: 0,
		externalId: unprotectString(action._id),
		rundownId: action.rundownId,
		sourceLayerId,
		outputLayerId,
		_rank: action.display._rank || 0,
		content: content,
		adlibAction: action,
		tags: action.display.tags,
		currentPieceTags: action.display.currentPieceTags,
		nextPieceTags: action.display.nextPieceTags,
		lifespan: PieceLifespan.WithinPart, // value doesn't matter
		noHotKey: action.display.noHotKey,
	})
}

// End TEMP

export function updateExpectedMediaItemsOnPart(
	cache: CacheForRundownPlaylist,
	rundownId: RundownId,
	partId: PartId
): void {
	check(rundownId, String)
	check(partId, String)

	const rundown = cache.Rundowns.findOne(rundownId)
	if (!rundown) {
		cache.deferAfterSave(() => {
			const removedItems = ExpectedMediaItems.remove({
				rundownId: rundownId,
			})
			logger.info(`Removed ${removedItems} expected media items for deleted rundown "${rundownId}"`)
		})
		return
	}
	const studioId = rundown.studioId

	const part = cache.Parts.findOne(partId)
	if (!part) {
		cache.deferAfterSave(() => {
			const removedItems = ExpectedMediaItems.remove({
				rundownId: rundownId,
				partId: partId,
			})
			logger.info(`Removed ${removedItems} expected media items for deleted part "${partId}"`)
		})
		return
	}

	cache.deferAfterSave(() => {
		const pieces = cache.Pieces.findFetch({
			startRundownId: rundown._id,
			startPartId: partId,
		})

		const adlibs = AdLibPieces.find({
			rundownId: rundown._id,
			partId: partId,
		}).fetch()

		const actions = AdLibActions.find({
			rundownId: rundown._id,
			partId: partId,
		}).fetch()

		const eMIs = generateExpectedMediaItemsFull(studioId, rundownId, pieces, adlibs, actions)
		saveIntoDb<ExpectedMediaItem, ExpectedMediaItem>(
			ExpectedMediaItems,
			{
				rundownId: rundown._id,
				partId: partId,
			},
			eMIs
		)
	})
}
