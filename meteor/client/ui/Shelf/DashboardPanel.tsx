import * as React from 'react'
import * as _ from 'underscore'
import * as mousetrap from 'mousetrap'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import ClassNames from 'classnames'
import { mousetrapHelper } from '../../lib/mousetrapHelper'

import { Spinner } from '../../lib/Spinner'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { RundownViewKbdShortcuts } from '../RundownViewKbdShortcuts'
import { IOutputLayer, ISourceLayer, IBlueprintActionTriggerMode } from '@sofie-automation/blueprints-integration'
import { PubSub } from '../../../lib/api/pubsub'
import { doUserAction, UserAction } from '../../lib/userAction'
import { NotificationCenter, Notification, NoticeLevel } from '../../lib/notifications/notifications'
import { DashboardLayoutFilter } from '../../../lib/collections/RundownLayouts'
import { getCurrentTime, unprotectString } from '../../../lib/lib'
import {
	IAdLibPanelProps,
	AdLibFetchAndFilterProps,
	fetchAndFilter,
	matchFilter,
	AdLibPanelToolbar,
} from './AdLibPanel'
import { DashboardPieceButton } from './DashboardPieceButton'
import { ensureHasTrailingSlash, contextMenuHoldToDisplayTime } from '../../lib/lib'
import { Studio } from '../../../lib/collections/Studios'
import { PieceId, Pieces } from '../../../lib/collections/Pieces'
import { MeteorCall } from '../../../lib/api/methods'
import { PartInstanceId } from '../../../lib/collections/PartInstances'
import { ContextMenuTrigger } from '@jstarpl/react-contextmenu'
import { setShelfContextMenuContext, ContextType } from './ShelfContextMenu'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { HotkeyAssignmentType, RegisteredHotkeys, registerHotkey } from '../../lib/hotkeyRegistry'
import { memoizedIsolatedAutorun } from '../../lib/reactiveData/reactiveDataHelper'
import { AdLibPieceUi, isAdLibOnAir } from '../../lib/shelf'
import { PieceInstance, PieceInstances } from '../../../lib/collections/PieceInstances'
import { processAndPrunePieceInstanceTimings } from '../../../lib/rundown/infinites'
import { invalidateAt } from '../../lib/invalidatingTime'

interface IState {
	outputLayers: {
		[key: string]: IOutputLayer
	}
	sourceLayers: {
		[key: string]: ISourceLayer
	}
	searchFilter: string | undefined
	selectedAdLib?: AdLibPieceUi
}

const BUTTON_GRID_WIDTH = 1
const BUTTON_GRID_HEIGHT = 0.61803

export interface IDashboardPanelProps {
	searchFilter?: string | undefined
	mediaPreviewUrl?: string
	shouldQueue: boolean
	hotkeyGroup: string
}

export interface IDashboardPanelTrackedProps {
	studio: Studio | undefined
	unfinishedAdLibIds: PieceId[]
	unfinishedTags: string[]
	nextAdLibIds: PieceId[]
	nextTags: string[]
}

interface DashboardPositionableElement {
	x: number
	y: number
	width: number
	height: number
	scale?: number
}

export function dashboardElementPosition(
	el: DashboardPositionableElement
): React.CSSProperties & { '--dashboard-panel-scale': number | undefined } {
	return {
		width:
			el.width >= 0
				? `calc((${el.width} * var(--dashboard-button-grid-width)) + var(--dashboard-panel-margin-width))`
				: undefined,
		height:
			el.height >= 0
				? `calc((${el.height} * var(--dashboard-button-grid-height)) + var(--dashboard-panel-margin-height))`
				: undefined,
		left:
			el.x >= 0
				? `calc(${el.x} * var(--dashboard-button-grid-width))`
				: el.width < 0
				? `calc(${-1 * el.width - 1} * var(--dashboard-button-grid-width))`
				: undefined,
		top:
			el.y >= 0
				? `calc(${el.y} * var(--dashboard-button-grid-height))`
				: el.height < 0
				? `calc(${-1 * el.height - 1} * var(--dashboard-button-grid-height))`
				: undefined,
		right:
			el.x < 0
				? `calc(${-1 * el.x - 1} * var(--dashboard-button-grid-width))`
				: el.width < 0
				? `calc(${-1 * el.width - 1} * var(--dashboard-button-grid-width))`
				: undefined,
		bottom:
			el.y < 0
				? `calc(${-1 * el.y - 1} * var(--dashboard-button-grid-height))`
				: el.height < 0
				? `calc(${-1 * el.height - 1} * var(--dashboard-button-grid-height))`
				: undefined,
		'--dashboard-panel-scale': el.scale || undefined,
	}
}

export class DashboardPanelInner extends MeteorReactComponent<
	Translated<IAdLibPanelProps & IDashboardPanelProps & AdLibFetchAndFilterProps & IDashboardPanelTrackedProps>,
	IState
> {
	usedHotkeys: Array<string> = []

	constructor(props: Translated<IAdLibPanelProps & AdLibFetchAndFilterProps>) {
		super(props)

		this.state = {
			outputLayers: {},
			sourceLayers: {},
			searchFilter: undefined,
		}
	}

	static getDerivedStateFromProps(props: IAdLibPanelProps, state) {
		let tOLayers: {
			[key: string]: IOutputLayer
		} = {}
		let tSLayers: {
			[key: string]: ISourceLayer
		} = {}

		if (props.showStyleBase && props.showStyleBase.outputLayers && props.showStyleBase.sourceLayers) {
			props.showStyleBase.outputLayers.forEach((outputLayer) => {
				tOLayers[outputLayer._id] = outputLayer
			})
			props.showStyleBase.sourceLayers.forEach((sourceLayer) => {
				tSLayers[sourceLayer._id] = sourceLayer
			})

			return {
				outputLayers: tOLayers,
				sourceLayers: tSLayers,
			}
		}
		return null
	}

	componentDidMount() {
		this.autorun(() => {
			const rundownIds = this.props.playlist.getRundownIDs()
			if (rundownIds.length > 0) {
				this.subscribe(PubSub.pieceInstances, {
					rundownId: {
						$in: rundownIds,
					},
					startedPlayback: {
						$exists: true,
					},
					$and: [
						{
							$or: [
								{
									adLibSourceId: {
										$exists: true,
									},
								},
								{
									'piece.tags': {
										$exists: true,
									},
								},
							],
						},
						{
							$or: [
								{
									stoppedPlayback: {
										$eq: 0,
									},
								},
								{
									stoppedPlayback: {
										$exists: false,
									},
								},
							],
						},
					],
				})
			}
		})

		this.refreshKeyboardHotkeys()
	}

	componentDidUpdate(prevProps: IAdLibPanelProps & AdLibFetchAndFilterProps) {
		mousetrapHelper.unbindAll(this.usedHotkeys, 'keyup', this.props.hotkeyGroup)
		mousetrapHelper.unbindAll(this.usedHotkeys, 'keydown', this.props.hotkeyGroup)
		this.usedHotkeys.length = 0

		// Unregister hotkeys if group name has changed
		if (prevProps.hotkeyGroup !== this.props.hotkeyGroup) {
			RegisteredHotkeys.remove({
				tag: prevProps.hotkeyGroup,
			})
		}

		this.refreshKeyboardHotkeys()
	}

	componentWillUnmount() {
		this._cleanUp()
		mousetrapHelper.unbindAll(this.usedHotkeys, 'keyup', this.props.hotkeyGroup)
		mousetrapHelper.unbindAll(this.usedHotkeys, 'keydown', this.props.hotkeyGroup)

		RegisteredHotkeys.remove({
			tag: this.props.hotkeyGroup,
		})

		this.usedHotkeys.length = 0
	}

	isAdLibOnAir(adLib: AdLibPieceUi) {
		return isAdLibOnAir(this.props.unfinishedAdLibIds, this.props.unfinishedTags, adLib)
	}

	isAdLibDisplayedAsOnAir(adLib: AdLibPieceUi) {
		return isAdLibDisplayedAsOnAir(this.props.unfinishedAdLibIds, this.props.unfinishedTags, adLib)
	}

	findNext(adLibs: AdLibPieceUi[]) {
		return findNext(
			this.props.nextAdLibIds,
			this.props.unfinishedTags,
			this.props.nextTags,
			adLibs,
			!!this.props.filter?.nextInCurrentPart,
			!!this.props.filter?.oneNextPerSourceLayer
		)
	}

	refreshKeyboardHotkeys() {
		if (!this.props.studioMode) return

		// Unregister even when "registerHotkeys" is false, in the case that it has just been toggled off.
		RegisteredHotkeys.remove({
			tag: this.props.hotkeyGroup,
		})

		if (!this.props.registerHotkeys) return

		const { t } = this.props

		let preventDefault = (e) => {
			e.preventDefault()
		}

		if (this.props.liveSegment && this.props.liveSegment.pieces) {
			this.props.liveSegment.pieces.forEach((item) => {
				if (item.hotkey) {
					mousetrapHelper.bind(item.hotkey, preventDefault, 'keydown', this.props.hotkeyGroup)
					mousetrapHelper.bind(
						item.hotkey,
						(e: mousetrap.ExtendedKeyboardEvent) => {
							preventDefault(e)
							this.onToggleAdLib(item, false, e)
						},
						'keyup',
						this.props.hotkeyGroup
					)
					this.usedHotkeys.push(item.hotkey)

					registerHotkey(
						item.hotkey,
						item.name,
						HotkeyAssignmentType.ADLIB,
						this.props.sourceLayerLookup[item.sourceLayerId],
						item.toBeQueued || false,
						this.onToggleAdLib,
						[item, false],
						this.props.hotkeyGroup
					)

					const sourceLayer = this.props.sourceLayerLookup[item.sourceLayerId]
					if (sourceLayer && sourceLayer.isQueueable) {
						const queueHotkey = [RundownViewKbdShortcuts.ADLIB_QUEUE_MODIFIER, item.hotkey].join('+')
						mousetrapHelper.bind(queueHotkey, preventDefault, 'keydown', this.props.hotkeyGroup)
						mousetrapHelper.bind(
							queueHotkey,
							(e: mousetrap.ExtendedKeyboardEvent) => {
								preventDefault(e)
								this.onToggleAdLib(item, true, e)
							},
							'keyup',
							this.props.hotkeyGroup
						)
						this.usedHotkeys.push(queueHotkey)
					}
				}
			})
		}

		if (this.props.rundownBaselineAdLibs) {
			this.props.rundownBaselineAdLibs.forEach((item) => {
				if (item.hotkey) {
					mousetrapHelper.bind(item.hotkey, preventDefault, 'keydown', this.props.hotkeyGroup)
					mousetrapHelper.bind(
						item.hotkey,
						(e: mousetrap.ExtendedKeyboardEvent) => {
							preventDefault(e)
							this.onToggleAdLib(item, false, e)
						},
						'keyup',
						this.props.hotkeyGroup
					)
					this.usedHotkeys.push(item.hotkey)

					registerHotkey(
						item.hotkey,
						item.name,
						HotkeyAssignmentType.ADLIB,
						this.props.sourceLayerLookup[item.sourceLayerId],
						item.toBeQueued || false,
						this.onToggleAdLib,
						[item, false],
						this.props.hotkeyGroup
					)

					const sourceLayer = this.props.sourceLayerLookup[item.sourceLayerId]
					if (sourceLayer && sourceLayer.isQueueable) {
						const queueHotkey = [RundownViewKbdShortcuts.ADLIB_QUEUE_MODIFIER, item.hotkey].join('+')
						mousetrapHelper.bind(queueHotkey, preventDefault, 'keydown', this.props.hotkeyGroup)
						mousetrapHelper.bind(
							queueHotkey,
							(e: mousetrap.ExtendedKeyboardEvent) => {
								preventDefault(e)
								this.onToggleAdLib(item, true, e)
							},
							'keyup',
							this.props.hotkeyGroup
						)
						this.usedHotkeys.push(queueHotkey)
					}
				}
			})
		}

		if (this.props.sourceLayerLookup) {
			const clearKeyboardHotkeySourceLayers: { [hotkey: string]: ISourceLayer[] } = {}

			_.each(this.props.sourceLayerLookup, (sourceLayer) => {
				if (sourceLayer.clearKeyboardHotkey) {
					sourceLayer.clearKeyboardHotkey.split(',').forEach((hotkey) => {
						if (!clearKeyboardHotkeySourceLayers[hotkey]) clearKeyboardHotkeySourceLayers[hotkey] = []
						clearKeyboardHotkeySourceLayers[hotkey].push(sourceLayer)
					})
				}
			})

			_.each(clearKeyboardHotkeySourceLayers, (sourceLayers, hotkey) => {
				mousetrapHelper.bind(hotkey, preventDefault, 'keydown', this.props.hotkeyGroup)
				mousetrapHelper.bind(
					hotkey,
					(e: mousetrap.ExtendedKeyboardEvent) => {
						preventDefault(e)
						this.onClearAllSourceLayers(sourceLayers, e)
					},
					'keyup',
					this.props.hotkeyGroup
				)
				this.usedHotkeys.push(hotkey)

				registerHotkey(
					hotkey,
					t('Clear {{layerNames}}', {
						layerNames: _.unique(sourceLayers.map((sourceLayer) => sourceLayer.name)).join(', '),
					}),
					HotkeyAssignmentType.GLOBAL_ADLIB,
					undefined,
					false,
					this.onClearAllSourceLayers,
					[sourceLayers],
					this.props.hotkeyGroup
				)
			})
		}
	}

	onToggleAdLib = (adlibPiece: AdLibPieceUi, queue: boolean, e: any, mode?: IBlueprintActionTriggerMode) => {
		const { t } = this.props

		queue = queue || this.props.shouldQueue

		if (adlibPiece.invalid) {
			NotificationCenter.push(
				new Notification(
					t('Invalid AdLib'),
					NoticeLevel.WARNING,
					t('Cannot play this AdLib because it is marked as Invalid'),
					'toggleAdLib'
				)
			)
			return
		}
		if (adlibPiece.floated) {
			NotificationCenter.push(
				new Notification(
					t('Floated AdLib'),
					NoticeLevel.WARNING,
					t('Cannot play this AdLib because it is marked as Floated'),
					'toggleAdLib'
				)
			)
			return
		}

		let sourceLayer = this.props.sourceLayerLookup && this.props.sourceLayerLookup[adlibPiece.sourceLayerId]

		if (queue && sourceLayer && !sourceLayer.isQueueable) {
			console.log(`Item "${adlibPiece._id}" is on sourceLayer "${adlibPiece.sourceLayerId}" that is not queueable.`)
			queue = false
		}
		if (this.props.playlist && this.props.playlist.currentPartInstanceId) {
			const currentPartInstanceId = this.props.playlist.currentPartInstanceId
			if (!this.isAdLibOnAir(adlibPiece) || !(sourceLayer && sourceLayer.clearKeyboardHotkey)) {
				if (adlibPiece.isAction && adlibPiece.adlibAction) {
					const action = adlibPiece.adlibAction
					doUserAction(t, e, adlibPiece.isGlobal ? UserAction.START_GLOBAL_ADLIB : UserAction.START_ADLIB, (e) =>
						MeteorCall.userAction.executeAction(
							e,
							this.props.playlist._id,
							action.actionId,
							action.userData,
							mode?.data
						)
					)
				} else if (!adlibPiece.isGlobal && !adlibPiece.isAction) {
					doUserAction(t, e, UserAction.START_ADLIB, (e) =>
						MeteorCall.userAction.segmentAdLibPieceStart(
							e,
							this.props.playlist._id,
							currentPartInstanceId,
							adlibPiece._id,
							queue || false
						)
					)
				} else if (adlibPiece.isGlobal && !adlibPiece.isSticky) {
					doUserAction(t, e, UserAction.START_GLOBAL_ADLIB, (e) =>
						MeteorCall.userAction.baselineAdLibPieceStart(
							e,
							this.props.playlist._id,
							currentPartInstanceId,
							adlibPiece._id,
							queue || false
						)
					)
				} else if (adlibPiece.isSticky) {
					this.onToggleSticky(adlibPiece.sourceLayerId, e)
				}
			} else {
				if (sourceLayer && sourceLayer.clearKeyboardHotkey) {
					this.onClearAllSourceLayers([sourceLayer], e)
				}
			}
		}
	}

	onToggleSticky = (sourceLayerId: string, e: any) => {
		if (this.props.playlist && this.props.playlist.currentPartInstanceId && this.props.playlist.active) {
			const { t } = this.props
			doUserAction(t, e, UserAction.START_STICKY_PIECE, (e) =>
				MeteorCall.userAction.sourceLayerStickyPieceStart(e, this.props.playlist._id, sourceLayerId)
			)
		}
	}

	onClearAllSourceLayers = (sourceLayers: ISourceLayer[], e: any) => {
		const { t } = this.props
		if (this.props.playlist && this.props.playlist.currentPartInstanceId) {
			const playlistId = this.props.playlist._id
			const currentPartInstanceId = this.props.playlist.currentPartInstanceId
			doUserAction(t, e, UserAction.CLEAR_SOURCELAYER, (e) =>
				MeteorCall.userAction.sourceLayerOnPartStop(
					e,
					playlistId,
					currentPartInstanceId,
					_.map(sourceLayers, (sl) => sl._id)
				)
			)
		}
	}

	onFilterChange = (filter: string) => {
		this.setState({
			searchFilter: filter,
		})
	}

	onIn = (e: any) => {
		const { t } = this.props
		if (this.state.selectedAdLib) {
			const piece = this.state.selectedAdLib
			let sourceLayer = this.props.sourceLayerLookup && this.props.sourceLayerLookup[piece.sourceLayerId]
			if (this.props.playlist && this.props.playlist.currentPartInstanceId) {
				if (!this.isAdLibOnAir(piece) || !(sourceLayer && sourceLayer.clearKeyboardHotkey)) {
					if (piece.isAction && piece.adlibAction) {
						const action = piece.adlibAction
						doUserAction(t, e, piece.isGlobal ? UserAction.START_GLOBAL_ADLIB : UserAction.START_ADLIB, (e) =>
							MeteorCall.userAction.executeAction(e, this.props.playlist._id, action.actionId, action.userData)
						)
					} else if (!piece.isGlobal) {
						doUserAction(t, e, UserAction.START_ADLIB, (e) =>
							MeteorCall.userAction.segmentAdLibPieceStart(
								e,
								this.props.playlist._id,
								this.props.playlist.currentPartInstanceId as PartInstanceId,
								piece._id,
								false
							)
						)
					} else if (piece.isGlobal && !piece.isSticky) {
						doUserAction(t, e, UserAction.START_GLOBAL_ADLIB, (e) =>
							MeteorCall.userAction.baselineAdLibPieceStart(
								e,
								this.props.playlist._id,
								this.props.playlist.currentPartInstanceId as PartInstanceId,
								piece._id,
								false
							)
						)
					} else if (piece.isSticky) {
						this.onToggleSticky(piece.sourceLayerId, e)
					}
				}
			}
		}
	}

	onOut = (e: any, outButton?: boolean) => {
		const { t } = this.props
		if (this.state.selectedAdLib) {
			const piece = this.state.selectedAdLib
			let sourceLayer = this.props.sourceLayerLookup && this.props.sourceLayerLookup[piece.sourceLayerId]
			if (sourceLayer && (sourceLayer.clearKeyboardHotkey || outButton)) {
				this.onClearAllSourceLayers([sourceLayer], e)
			}
		}
	}

	onSelectAdLib = (piece: AdLibPieceUi, queue: boolean, e: any) => {
		this.setState({
			selectedAdLib: piece,
		})
	}

	render() {
		const { t } = this.props
		if (this.props.visible && this.props.showStyleBase && this.props.filter) {
			const filter = this.props.filter as DashboardLayoutFilter
			const uniquenessIds = new Set<string>()
			const liveSegment = this.props.uiSegments.find((i) => i.isLive === true)
			if (!this.props.uiSegments || !this.props.playlist) {
				return <Spinner />
			} else {
				return (
					<div
						className={ClassNames('dashboard-panel', {
							'dashboard-panel--take': filter.displayTakeButtons,
						})}
						style={dashboardElementPosition(filter)}>
						<h4 className="dashboard-panel__header">{this.props.filter.name}</h4>
						{filter.enableSearch && <AdLibPanelToolbar onFilterChange={this.onFilterChange} />}
						<div
							className={ClassNames('dashboard-panel__panel', {
								'dashboard-panel__panel--horizontal': filter.overflowHorizontally,
							})}>
							{this.findNext(
								this.props.rundownBaselineAdLibs
									.concat(_.flatten(this.props.uiSegments.map((seg) => seg.pieces)))
									.filter((item) =>
										matchFilter(
											item,
											this.props.showStyleBase,
											liveSegment,
											this.props.filter,
											this.state.searchFilter,
											uniquenessIds
										)
									)
							).map((adLibPiece: AdLibPieceUi & { isNext: boolean }) => {
								return (
									<ContextMenuTrigger
										id="shelf-context-menu"
										collect={() =>
											setShelfContextMenuContext({
												type: ContextType.ADLIB,
												details: {
													adLib: adLibPiece,
													onToggle: this.onToggleAdLib,
												},
											})
										}
										renderTag="span"
										key={unprotectString(adLibPiece._id)}
										holdToDisplay={contextMenuHoldToDisplayTime()}>
										<DashboardPieceButton
											piece={adLibPiece}
											studio={this.props.studio}
											layer={this.state.sourceLayers[adLibPiece.sourceLayerId]}
											outputLayer={this.state.outputLayers[adLibPiece.outputLayerId]}
											onToggleAdLib={filter.displayTakeButtons ? this.onSelectAdLib : this.onToggleAdLib}
											playlist={this.props.playlist}
											isOnAir={this.isAdLibDisplayedAsOnAir(adLibPiece)}
											isNext={adLibPiece.isNext}
											mediaPreviewUrl={
												this.props.studio
													? ensureHasTrailingSlash(this.props.studio.settings.mediaPreviewsUrl + '' || '') || ''
													: ''
											}
											widthScale={filter.buttonWidthScale}
											heightScale={filter.buttonHeightScale}
											displayStyle={filter.displayStyle}
											showThumbnailsInList={filter.showThumbnailsInList}
											canOverflowHorizontally={filter.overflowHorizontally}
											lineBreak={filter.lineBreak}
											isSelected={this.state.selectedAdLib && adLibPiece._id === this.state.selectedAdLib._id}>
											{adLibPiece.name}
										</DashboardPieceButton>
									</ContextMenuTrigger>
								)
							})}
						</div>
						{filter.displayTakeButtons && (
							<div className="dashboard-panel__buttons">
								<div
									className={ClassNames('dashboard-panel__panel__button')}
									onClick={(e) => {
										this.onIn(e)
									}}>
									<span className="dashboard-panel__panel__button__label">{t('In')}</span>
								</div>
								<div
									className={ClassNames('dashboard-panel__panel__button')}
									onClick={(e) => {
										this.onOut(e, true)
									}}>
									<span className="dashboard-panel__panel__button__label">{t('Out')}</span>
								</div>
							</div>
						)}
					</div>
				)
			}
		}
		return null
	}
}

export function getUnfinishedPieceInstancesReactive(
	currentPartInstanceId: PartInstanceId | null,
	adlib: boolean = true
) {
	let prospectivePieces: PieceInstance[] = []
	const now = getCurrentTime()
	if (currentPartInstanceId) {
		prospectivePieces = PieceInstances.find({
			startedPlayback: {
				$exists: true,
			},
			$and: [
				{
					$or: [
						{
							stoppedPlayback: {
								$eq: 0,
							},
						},
						{
							stoppedPlayback: {
								$exists: false,
							},
						},
					],
				},
				{
					$or: [
						{
							adLibSourceId: {
								$exists: true,
							},
						},
						{
							'piece.tags': {
								$exists: true,
							},
						},
					],
				},
				{
					$or: [
						{
							userDuration: {
								$exists: false,
							},
						},
						{
							'userDuration.end': {
								$exists: false,
							},
						},
					],
				},
			],
		}).fetch()

		let nearestEnd = Number.POSITIVE_INFINITY
		prospectivePieces = prospectivePieces.filter((pieceInstance) => {
			const piece = pieceInstance.piece
			let end: number | undefined =
				pieceInstance.userDuration && typeof pieceInstance.userDuration.end === 'number'
					? pieceInstance.userDuration.end
					: typeof piece.enable.duration === 'number'
					? piece.enable.duration + pieceInstance.startedPlayback!
					: undefined

			if (end !== undefined) {
				if (end > now) {
					nearestEnd = nearestEnd > end ? end : nearestEnd
					return true
				} else {
					return false
				}
			}
			return true
		})

		if (Number.isFinite(nearestEnd)) invalidateAt(nearestEnd)
	}

	return prospectivePieces
}

export function getNextPiecesReactive(
	showStyleBase: ShowStyleBase,
	nextPartInstanceId: PartInstanceId | null
): PieceInstance[] {
	let prospectivePieceInstances: PieceInstance[] = []
	if (nextPartInstanceId) {
		prospectivePieceInstances = PieceInstances.find({
			partInstanceId: nextPartInstanceId,
			$and: [
				{
					piece: {
						$exists: true,
					},
				},
				{
					$or: [
						{
							adLibSourceId: {
								$exists: true,
							},
						},
						{
							'piece.tags': {
								$exists: true,
							},
						},
					],
				},
			],
		}).fetch()

		prospectivePieceInstances = processAndPrunePieceInstanceTimings(showStyleBase, prospectivePieceInstances, 0)
	}

	return prospectivePieceInstances
}

export function getUnfinishedPieceInstancesGrouped(
	currentPartInstanceId: PartInstanceId | null
): Pick<IDashboardPanelTrackedProps, 'unfinishedAdLibIds' | 'unfinishedTags'> & {
	unfinishedPieceInstances: PieceInstance[]
} {
	const unfinishedPieceInstances = getUnfinishedPieceInstancesReactive(currentPartInstanceId)

	const unfinishedAdLibIds: PieceId[] = unfinishedPieceInstances
		.filter((piece) => !!piece.adLibSourceId)
		.map((piece) => piece.adLibSourceId!)
	const unfinishedTags: string[] = unfinishedPieceInstances
		.filter((piece) => !!piece.piece.tags)
		.map((piece) => piece.piece.tags!)
		.reduce((a, b) => a.concat(b), [])

	return {
		unfinishedAdLibIds,
		unfinishedTags,
		unfinishedPieceInstances,
	}
}

export function getNextPieceInstancesGrouped(
	showStyleBase: ShowStyleBase,
	nextPartInstanceId: PartInstanceId | null
): Pick<IDashboardPanelTrackedProps, 'nextAdLibIds' | 'nextTags'> & { nextPieceInstances: PieceInstance[] } {
	const nextPieceInstances = getNextPiecesReactive(showStyleBase, nextPartInstanceId)

	const nextAdLibIds: PieceId[] = nextPieceInstances
		.filter((piece) => !!piece.adLibSourceId)
		.map((piece) => piece.adLibSourceId!)
	const nextTags: string[] = nextPieceInstances
		.filter((piece) => !!piece.piece.tags)
		.map((piece) => piece.piece.tags!)
		.reduce((a, b) => a.concat(b), [])

	return { nextAdLibIds, nextTags, nextPieceInstances }
}

export function isAdLibDisplayedAsOnAir(
	unfinishedAdLibIds: IDashboardPanelTrackedProps['unfinishedAdLibIds'],
	unfinishedTags: IDashboardPanelTrackedProps['unfinishedTags'],
	adLib: AdLibPieceUi
) {
	const isOnAir = isAdLibOnAir(unfinishedAdLibIds, unfinishedTags, adLib)
	return adLib.invertOnAirState ? !isOnAir : isOnAir
}

export function findNext(
	nextAdLibIds: IDashboardPanelTrackedProps['nextAdLibIds'],
	unfinishedTags: IDashboardPanelTrackedProps['unfinishedTags'],
	nextTags: IDashboardPanelTrackedProps['nextTags'],
	adLibs: AdLibPieceUi[],
	nextInCurrentPart: boolean,
	oneNextPerSourceLayer: boolean
): Array<AdLibPieceUi & { isNext: boolean }> {
	const nextAdlibs: Set<PieceId> = new Set()
	const nextAdlibsPerLayer: Map<string, PieceId> = new Map()
	adLibs.forEach((adLib) => {
		if (
			nextAdLibIds.includes(adLib._id) ||
			(adLib.nextPieceTags && adLib.nextPieceTags.every((tag) => nextTags.includes(tag)))
		) {
			if (oneNextPerSourceLayer) {
				if (nextAdlibsPerLayer.has(adLib.sourceLayerId)) {
					return
				} else {
					nextAdlibsPerLayer.set(adLib.sourceLayerId, adLib._id)
				}
			}
			nextAdlibs.add(adLib._id)
		}
	})
	if (nextInCurrentPart) {
		adLibs.forEach((adLib) => {
			if (adLib.nextPieceTags && adLib.nextPieceTags.every((tag) => unfinishedTags.includes(tag))) {
				if (oneNextPerSourceLayer) {
					if (nextAdlibsPerLayer.has(adLib.sourceLayerId)) {
						return
					} else {
						nextAdlibsPerLayer.set(adLib.sourceLayerId, adLib._id)
					}
				}
				nextAdlibs.add(adLib._id)
			}
		})
	}
	return adLibs.map((adLib) => {
		return {
			...adLib,
			isNext: nextAdlibs.has(adLib._id),
		}
	})
}

export const DashboardPanel = translateWithTracker<
	Translated<IAdLibPanelProps & IDashboardPanelProps>,
	IState,
	AdLibFetchAndFilterProps & IDashboardPanelTrackedProps
>(
	(props: Translated<IAdLibPanelProps>) => {
		const { unfinishedAdLibIds, unfinishedTags, nextAdLibIds, nextTags } = memoizedIsolatedAutorun(
			(
				currentPartInstanceId: PartInstanceId | null,
				nextPartInstanceId: PartInstanceId | null,
				showStyleBase: ShowStyleBase
			) => {
				const { unfinishedAdLibIds, unfinishedTags } = getUnfinishedPieceInstancesGrouped(currentPartInstanceId)
				const { nextAdLibIds, nextTags } = getNextPieceInstancesGrouped(showStyleBase, nextPartInstanceId)
				return {
					unfinishedAdLibIds,
					unfinishedTags,
					nextAdLibIds,
					nextTags,
				}
			},
			'unfinishedAndNextAdLibsAndTags',
			props.playlist.currentPartInstanceId,
			props.playlist.nextPartInstanceId,
			props.showStyleBase
		)

		return {
			...fetchAndFilter(props),
			studio: props.playlist.getStudio(),
			unfinishedAdLibIds,
			unfinishedTags,
			nextAdLibIds,
			nextTags,
		}
	},
	(data, props: IAdLibPanelProps, nextProps: IAdLibPanelProps) => {
		return !_.isEqual(props, nextProps)
	}
)(DashboardPanelInner)
