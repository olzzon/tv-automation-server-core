import { Meteor } from 'meteor/meteor'
import * as React from 'react'
import { parse as queryStringParse } from 'query-string'
import * as VelocityReact from 'velocity-react'
import { Translated, translateWithTracker } from '../lib/ReactMeteorData/react-meteor-data'
import { VTContent, TSR } from '@sofie-automation/blueprints-integration'
import { withTranslation, WithTranslation } from 'react-i18next'
import timer from 'react-timer-hoc'
import CoreIcon from '@nrk/core-icons/jsx'
import { Spinner } from '../lib/Spinner'
import ClassNames from 'classnames'
import * as _ from 'underscore'
import Escape from 'react-escape'
import * as i18next from 'i18next'
import Moment from 'react-moment'
import Tooltip from 'rc-tooltip'
import { NavLink, Route, Prompt } from 'react-router-dom'
import { RundownPlaylist, RundownPlaylists, RundownPlaylistId } from '../../lib/collections/RundownPlaylists'
import { Rundown, Rundowns, RundownHoldState, RundownId } from '../../lib/collections/Rundowns'
import { Segment, SegmentId, Segments } from '../../lib/collections/Segments'
import { Studio, Studios, StudioRouteSet } from '../../lib/collections/Studios'
import { Part, Parts, PartId } from '../../lib/collections/Parts'

import { ContextMenu, MenuItem, ContextMenuTrigger } from '@jstarpl/react-contextmenu'

import { RundownTimingProvider } from './RundownView/RundownTiming/RundownTimingProvider'
import { withTiming, WithTiming } from './RundownView/RundownTiming/withTiming'
import { CurrentPartRemaining } from './RundownView/RundownTiming/CurrentPartRemaining'
import { AutoNextStatus } from './RundownView/RundownTiming/AutoNextStatus'
import { SegmentTimelineContainer, PieceUi, PartUi, SegmentUi } from './SegmentTimeline/SegmentTimelineContainer'
import { SegmentContextMenu } from './SegmentTimeline/SegmentContextMenu'
import { Shelf, ShelfBase, ShelfTabs } from './Shelf/Shelf'
import { RundownOverview } from './RundownView/RundownOverview'
import { RundownSystemStatus } from './RundownView/RundownSystemStatus'

import { getCurrentTime, unprotectString, protectString } from '../../lib/lib'
import { RundownUtils } from '../lib/rundown'

import * as mousetrap from 'mousetrap'
import { ErrorBoundary } from '../lib/ErrorBoundary'
import { ModalDialog, doModalDialog, isModalShowing } from '../lib/ModalDialog'
import { MeteorReactComponent } from '../lib/MeteorReactComponent'
import { getAllowStudio, getAllowDeveloper, getHelpMode, getAllowConfigure, getAllowService } from '../lib/localStorage'
import { ClientAPI } from '../../lib/api/client'
import {
	scrollToPart,
	scrollToPosition,
	scrollToSegment,
	maintainFocusOnPartInstance,
	scrollToPartInstance,
} from '../lib/viewPort'
import { AfterBroadcastForm } from './AfterBroadcastForm'
import { Tracker } from 'meteor/tracker'
import { RundownRightHandControls } from './RundownView/RundownRightHandControls'
import { mousetrapHelper } from '../lib/mousetrapHelper'
import { ShowStyleBases, ShowStyleBase } from '../../lib/collections/ShowStyleBases'
import { PeripheralDevicesAPI, callPeripheralDeviceFunction } from '../lib/clientAPI'
import {
	RONotificationEvent,
	onRONotificationClick as rundownNotificationHandler,
	RundownNotifier,
	reloadRundownPlaylistClick,
} from './RundownView/RundownNotifier'
import { NotificationCenterPanel } from '../lib/notifications/NotificationCenterPanel'
import { NotificationCenter, NoticeLevel, Notification } from '../lib/notifications/notifications'
import { SupportPopUp } from './SupportPopUp'
import { KeyboardFocusIndicator } from '../lib/KeyboardFocusIndicator'
import { PeripheralDevices, PeripheralDevice } from '../../lib/collections/PeripheralDevices'
import { PeripheralDeviceAPI } from '../../lib/api/peripheralDevice'
import { doUserAction, UserAction } from '../lib/userAction'
import { ReloadRundownPlaylistResponse, TriggerReloadDataResponse } from '../../lib/api/userActions'
import { ClipTrimDialog } from './ClipTrimPanel/ClipTrimDialog'
import { NoteType } from '../../lib/api/notes'
import { PubSub } from '../../lib/api/pubsub'
import {
	RundownLayout,
	RundownLayouts,
	RundownLayoutType,
	RundownLayoutBase,
	RundownLayoutId,
	RundownViewLayout,
	DashboardLayout,
	RundownLayoutShelfBase,
	RundownLayoutRundownHeader,
	RundownLayoutFilterBase,
} from '../../lib/collections/RundownLayouts'
import { VirtualElement } from '../lib/VirtualElement'
import { SEGMENT_TIMELINE_ELEMENT_ID } from './SegmentTimeline/SegmentTimeline'
import { NoraPreviewRenderer } from './FloatingInspectors/NoraFloatingInspector'
import { Buckets, Bucket } from '../../lib/collections/Buckets'
import { contextMenuHoldToDisplayTime } from '../lib/lib'
import { OffsetPosition } from '../utils/positions'
import { MeteorCall } from '../../lib/api/methods'
import { AdlibSegmentUi, fetchAndFilter, matchFilter, SourceLayerLookup } from './Shelf/AdLibPanel'
import { Settings } from '../../lib/Settings'
import { PointerLockCursor } from '../lib/PointerLockCursor'
import { documentTitle } from '../lib/DocumentTitleProvider'
import { PartInstance } from '../../lib/collections/PartInstances'
import { RundownDividerHeader } from './RundownView/RundownDividerHeader'
import { CASPARCG_RESTART_TIME } from '../../lib/constants'
import { memoizedIsolatedAutorun } from '../lib/reactiveData/reactiveDataHelper'
import RundownViewEventBus, { RundownViewEvents } from './RundownView/RundownViewEventBus'
import { HotkeyAssignmentType, RegisteredHotkeys, registerHotkey } from '../lib/hotkeyRegistry'
import { RundownLayoutsAPI } from '../../lib/api/rundownLayouts'
import { RundownViewKbdShortcuts } from './RundownViewKbdShortcuts'
import { AdLibPieceUi } from '../lib/shelf'
import { LoopingIcon } from '../lib/ui/icons/looping'
import { PlaylistLoopingHeader } from './RundownView/PlaylistLoopingHeader'

export const MAGIC_TIME_SCALE_FACTOR = 0.03

const HIDE_NOTIFICATIONS_AFTER_MOUNT: number | undefined = 5000

type WrappedShelf = ShelfBase & { getWrappedInstance(): ShelfBase }

interface ITimingWarningProps {
	playlist: RundownPlaylist
	inActiveRundownView?: boolean
	studioMode: boolean
	oneMinuteBeforeAction: (e: Event) => void
}

interface ITimingWarningState {
	plannedStartCloseShown?: boolean
	plannedStartCloseShow?: boolean
}
const WarningDisplay = withTranslation()(
	timer(5000)(
		class WarningDisplay extends React.Component<Translated<ITimingWarningProps>, ITimingWarningState> {
			private readonly REHEARSAL_MARGIN = 1 * 60 * 1000

			constructor(props: Translated<ITimingWarningProps>) {
				super(props)

				this.state = {}
			}

			componentDidUpdate(prevProps: ITimingWarningProps) {
				if (
					(this.props.playlist.active && !prevProps.playlist.active && this.props.playlist.rehearsal) ||
					this.props.playlist.rehearsal !== prevProps.playlist.rehearsal
				) {
					this.setState({
						plannedStartCloseShown: false,
					})
				}

				if (
					this.props.playlist.active &&
					this.props.playlist.rehearsal &&
					this.props.playlist.expectedStart &&
					// the expectedStart is near
					getCurrentTime() + this.REHEARSAL_MARGIN > this.props.playlist.expectedStart &&
					// but it's not horribly in the past
					getCurrentTime() <
						this.props.playlist.expectedStart + (this.props.playlist.expectedDuration || 60 * 60 * 1000) &&
					!this.props.inActiveRundownView &&
					!this.state.plannedStartCloseShown
				) {
					this.setState({
						plannedStartCloseShow: true,
						plannedStartCloseShown: true,
					})
				}
			}

			discard = () => {
				this.setState({
					plannedStartCloseShow: false,
				})
			}

			oneMinuteBeforeAction = (e: any) => {
				this.setState({
					plannedStartCloseShow: false,
				})

				this.props.oneMinuteBeforeAction(e)
			}

			render() {
				const { t } = this.props

				if (!this.props.playlist) return null

				return (
					<ModalDialog
						title={t('Start time is close')}
						acceptText={t('Yes')}
						secondaryText={t('No')}
						onAccept={this.oneMinuteBeforeAction}
						onDiscard={this.discard}
						onSecondary={this.discard}
						show={
							this.props.studioMode &&
							this.state.plannedStartCloseShow &&
							!(this.props.playlist.active && !this.props.playlist.rehearsal) &&
							this.props.playlist.active
						}>
						<p>
							{t(
								'You are in rehearsal mode, the broadcast starts in less than 1 minute. Do you want to reset the rundown and go into playout mode?'
							)}
						</p>
					</ModalDialog>
				)
			}
		}
	)
)
interface ITimingDisplayProps {
	rundownPlaylist: RundownPlaylist
	currentRundown: Rundown | undefined
	rundownCount: number
	layout: RundownLayoutRundownHeader | undefined
}

const TimingDisplay = withTranslation()(
	withTiming<ITimingDisplayProps & WithTranslation, {}>()(
		class TimingDisplay extends React.Component<Translated<WithTiming<ITimingDisplayProps>>> {
			private renderRundownName() {
				const { rundownPlaylist, currentRundown, rundownCount, t } = this.props
				return currentRundown && (rundownPlaylist.name !== currentRundown.name || rundownCount > 1) ? (
					<span
						className="timing-clock-label left hide-overflow rundown-name"
						title={
							rundownPlaylist.loop
								? t('{{currentRundownName}} - {{rundownPlaylistName}} (Looping)', {
										currentRundownName: currentRundown.name,
										rundownPlaylistName: rundownPlaylist.name,
								  })
								: t('{{currentRundownName}} - {{rundownPlaylistName}}', {
										currentRundownName: currentRundown.name,
										rundownPlaylistName: rundownPlaylist.name,
								  })
						}>
						{rundownPlaylist.loop && <LoopingIcon />} <strong>{currentRundown.name}</strong> {rundownPlaylist.name}
					</span>
				) : (
					<span
						className="timing-clock-label left hide-overflow rundown-name"
						title={
							rundownPlaylist.loop
								? t('{{rundownPlaylistName}} (Looping)', {
										rundownPlaylistName: rundownPlaylist.name,
								  })
								: rundownPlaylist.name
						}>
						{rundownPlaylist.loop && <LoopingIcon />} {rundownPlaylist.name}
					</span>
				)
			}
			render() {
				const { t, rundownPlaylist } = this.props

				if (!rundownPlaylist) return null

				return (
					<div className="timing mod">
						{rundownPlaylist.startedPlayback && rundownPlaylist.active && !rundownPlaylist.rehearsal ? (
							<span className="timing-clock plan-start left">
								<span className="timing-clock-label left">{t('Started')}</span>
								<Moment interval={0} format="HH:mm:ss" date={rundownPlaylist.startedPlayback} />
							</span>
						) : (
							<span className="timing-clock plan-start left">
								<span className="timing-clock-label left">{t('Planned Start')}</span>
								<Moment interval={0} format="HH:mm:ss" date={rundownPlaylist.expectedStart} />
							</span>
						)}
						{rundownPlaylist.startedPlayback && rundownPlaylist.active && !rundownPlaylist.rehearsal ? (
							rundownPlaylist.expectedStart ? (
								<span className="timing-clock countdown playback-started left">
									{this.renderRundownName()}
									{RundownUtils.formatDiffToTimecode(
										rundownPlaylist.startedPlayback - rundownPlaylist.expectedStart,
										true,
										false,
										true,
										true,
										true
									)}
								</span>
							) : (
								<span className="timing-clock countdown playback-started left">{this.renderRundownName()}</span>
							)
						) : (
							(rundownPlaylist.expectedStart ? (
								<span
									className={ClassNames('timing-clock countdown plan-start left', {
										heavy: getCurrentTime() > rundownPlaylist.expectedStart,
									})}>
									{this.renderRundownName()}
									{RundownUtils.formatDiffToTimecode(
										getCurrentTime() - rundownPlaylist.expectedStart,
										true,
										false,
										true,
										true,
										true
									)}
								</span>
							) : (
								<span className={ClassNames('timing-clock countdown plan-start left')}>{this.renderRundownName()}</span>
							)) || undefined
						)}
						<span className="timing-clock time-now">
							<Moment interval={0} format="HH:mm:ss" date={getCurrentTime()} />
						</span>
						{rundownPlaylist.currentPartInstanceId && (
							<span className="timing-clock current-remaining">
								<CurrentPartRemaining
									currentPartInstanceId={rundownPlaylist.currentPartInstanceId}
									heavyClassName="overtime"
								/>
								<AutoNextStatus />
								{rundownPlaylist.holdState && rundownPlaylist.holdState !== RundownHoldState.COMPLETE ? (
									<div className="rundown__header-status rundown__header-status--hold">{t('Hold')}</div>
								) : null}
							</span>
						)}
						{rundownPlaylist.expectedDuration ? (
							<React.Fragment>
								{rundownPlaylist.expectedStart && rundownPlaylist.expectedDuration && (
									<span className="timing-clock plan-end right visual-last-child">
										<span className="timing-clock-label right">{t('Planned End')}</span>
										<Moment
											interval={0}
											format="HH:mm:ss"
											date={rundownPlaylist.expectedStart + rundownPlaylist.expectedDuration}
										/>
									</span>
								)}
								{rundownPlaylist.expectedStart && rundownPlaylist.expectedDuration && (
									<span className="timing-clock countdown plan-end right">
										{RundownUtils.formatDiffToTimecode(
											getCurrentTime() - (rundownPlaylist.expectedStart + rundownPlaylist.expectedDuration),
											true,
											true,
											true
										)}
									</span>
								)}
								{rundownPlaylist.expectedDuration && (
									<span
										className={ClassNames('timing-clock heavy-light right', {
											heavy:
												(this.props.timingDurations.asPlayedRundownDuration || 0) <
												(rundownPlaylist.expectedDuration || 0),
											light:
												(this.props.timingDurations.asPlayedRundownDuration || 0) >
												(rundownPlaylist.expectedDuration || 0),
										})}>
										<span className="timing-clock-label right">{t('Diff')}</span>
										{RundownUtils.formatDiffToTimecode(
											(this.props.timingDurations.asPlayedRundownDuration || 0) - rundownPlaylist.expectedDuration,
											true,
											false,
											true,
											true,
											true,
											undefined,
											true
										)}
									</span>
								)}
							</React.Fragment>
						) : (
							<React.Fragment>
								{this.props.timingDurations ? (
									<span className="timing-clock plan-end right visual-last-child">
										<span className="timing-clock-label right">
											{this.props.layout?.expectedEndText ? t(this.props.layout.expectedEndText) : t('Expected End')}
										</span>
										<Moment
											interval={0}
											format="HH:mm:ss"
											date={getCurrentTime() + (this.props.timingDurations.totalRundownDuration || 0)}
										/>
									</span>
								) : null}
								{this.props.timingDurations ? (
									<span
										className={ClassNames('timing-clock heavy-light right', {
											heavy:
												(this.props.timingDurations.asPlayedRundownDuration || 0) <
												(this.props.timingDurations.totalRundownDuration || 0),
											light:
												(this.props.timingDurations.asPlayedRundownDuration || 0) >
												(this.props.timingDurations.totalRundownDuration || 0),
										})}>
										<span className="timing-clock-label right">{t('Diff')}</span>
										{RundownUtils.formatDiffToTimecode(
											(this.props.timingDurations.asPlayedRundownDuration || 0) -
												(this.props.timingDurations.totalRundownDuration || 0),
											true,
											false,
											true,
											true,
											true,
											undefined,
											true
										)}
									</span>
								) : null}
							</React.Fragment>
						)}
					</div>
				)
			}
		}
	)
)

interface HotkeyDefinition {
	key: string
	label: string
	up?: (e: any) => void
	down?: (e: any) => void
}

interface IRundownHeaderProps {
	playlist: RundownPlaylist
	currentRundown: Rundown | undefined
	studio: Studio
	rundownIds: RundownId[]
	firstRundown: Rundown | undefined
	onActivate?: (isRehearsal: boolean) => void
	onRegisterHotkeys?: (hotkeys: Array<HotkeyDefinition>) => void
	studioMode: boolean
	inActiveRundownView?: boolean
	layout: RundownLayoutRundownHeader | undefined
}

interface IRundownHeaderState {
	isError: boolean
	errorMessage?: string
}

const RundownHeader = withTranslation()(
	class RundownHeader extends React.Component<Translated<IRundownHeaderProps>, IRundownHeaderState> {
		bindKeys: Array<{
			key: string
			up?: (e: KeyboardEvent) => any
			down?: (e: KeyboardEvent) => any
			label: string
			global?: boolean
			coolDown?: number
		}> = []
		constructor(props: Translated<IRundownHeaderProps>) {
			super(props)

			const { t } = props
			if (this.props.studioMode) {
				this.bindKeys = [
					{
						key: RundownViewKbdShortcuts.RUNDOWN_TAKE,
						up: this.keyTake,
						label: t('Take'),
						global: true,
					},
					/*{
						key: RundownViewKbdShortcuts.RUNDOWN_HOLD,
						up: this.keyHold,
						label: t('Hold'),
					},*/
					{
						key: RundownViewKbdShortcuts.RUNDOWN_UNDO_HOLD,
						up: this.keyHoldUndo,
						label: t('Undo Hold'),
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_ACTIVATE,
						up: this.keyActivate,
						label: t('Activate'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_ACTIVATE2,
						up: this.keyActivate,
						label: t('Activate'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_ACTIVATE3,
						up: this.keyActivate,
						label: t('Activate'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_ACTIVATE4,
						up: this.keyActivate,
						label: t('Activate'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_DEACTIVATE,
						up: this.keyDeactivate,
						label: t('Deactivate'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_DEACTIVATE2,
						up: this.keyDeactivate,
						label: t('Deactivate'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_ACTIVATE_REHEARSAL,
						up: this.keyActivateRehearsal,
						label: t('Activate (Rehearsal)'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_RESET_RUNDOWN,
						up: this.keyResetRundown,
						label: t('Reset Rundown'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_NEXT_FORWARD,
						up: this.keyMoveNextForward,
						label: t('Move Next forwards'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_NEXT_DOWN,
						up: this.keyMoveNextDown,
						label: t('Move Next to the following segment'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_NEXT_UP,
						up: this.keyMoveNextUp,
						label: t('Move Next to the previous segment'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_NEXT_BACK,
						up: this.keyMoveNextBack,
						label: t('Move Next backwards'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_NEXT_FORWARD2,
						up: this.keyMoveNextForward,
						label: t('Move Next forwards'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_NEXT_DOWN2,
						up: this.keyMoveNextDown,
						label: t('Move Next to the following segment'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_NEXT_UP2,
						up: this.keyMoveNextUp,
						label: t('Move Next to the previous segment'),
						global: true,
					},
					{
						key: RundownViewKbdShortcuts.RUNDOWN_NEXT_BACK2,
						up: this.keyMoveNextBack,
						label: t('Move Next backwards'),
						global: true,
					},
					// {
					// 	key: RundownViewKbdShortcuts.RUNDOWN_DISABLE_NEXT_ELEMENT,
					// 	up: this.keyDisableNextPiece,
					// 	label: t('Disable the next element'),
					// },
					// {
					// 	key: RundownViewKbdShortcuts.RUNDOWN_UNDO_DISABLE_NEXT_ELEMENT,
					// 	up: this.keyDisableNextPieceUndo,
					// 	label: t('Undo Disable the next element'),
					// },
					{
						key: RundownViewKbdShortcuts.RUNDOWN_LOG_ERROR,
						up: this.keyLogError,
						label: t('Log Error'),
						coolDown: 1000,
					},
				]
			} else {
				this.bindKeys = []
			}
			this.state = {
				isError: false,
			}
		}
		componentDidMount() {
			let preventDefault = (e: Event) => {
				e.preventDefault()
				e.stopImmediatePropagation()
				e.stopPropagation()
			}
			this.bindKeys.forEach((k) => {
				const method = k.global ? mousetrapHelper.bindGlobal : mousetrapHelper.bind
				let lastUsed = Date.now()
				if (k.up) {
					method(
						k.key,
						(e: KeyboardEvent) => {
							preventDefault(e)
							if (k.coolDown && lastUsed > Date.now() - k.coolDown) return
							if (k.up) k.up(e)
							lastUsed = Date.now()
						},
						'keyup',
						'RundownHeader'
					)
					method(
						k.key,
						(e: KeyboardEvent) => {
							preventDefault(e)
						},
						'keydown',
						'RundownHeader'
					)
				}
				if (k.down) {
					method(
						k.key,
						(e: KeyboardEvent) => {
							preventDefault(e)
							if (k.coolDown && lastUsed > Date.now() - k.coolDown) return
							if (k.down) k.down(e)
							lastUsed = Date.now()
						},
						'keydown',
						'RundownHeader'
					)
				}
			})

			if (typeof this.props.onRegisterHotkeys === 'function') {
				this.props.onRegisterHotkeys(this.bindKeys)
			}

			reloadRundownPlaylistClick.set(this.reloadRundownPlaylist)
		}

		componentWillUnmount() {
			this.bindKeys.forEach((k) => {
				if (k.up) {
					mousetrapHelper.unbind(k.key, 'RundownHeader', 'keyup')
					mousetrapHelper.unbind(k.key, 'RundownHeader', 'keydown')
				}
				if (k.down) {
					mousetrapHelper.unbind(k.key, 'RundownHeader', 'keydown')
				}
			})
		}
		keyTake = (e: mousetrap.ExtendedKeyboardEvent) => {
			if (!isModalShowing()) this.take(e)
		}
		keyHold = (e: mousetrap.ExtendedKeyboardEvent) => {
			this.hold(e)
		}
		keyHoldUndo = (e: mousetrap.ExtendedKeyboardEvent) => {
			this.holdUndo(e)
		}
		keyActivate = (e: mousetrap.ExtendedKeyboardEvent) => {
			this.activate(e)
		}
		keyActivateRehearsal = (e: mousetrap.ExtendedKeyboardEvent) => {
			this.activateRehearsal(e)
		}

		keyDeactivate = (e: mousetrap.ExtendedKeyboardEvent) => {
			this.deactivate(e)
		}
		keyResetRundown = (e: mousetrap.ExtendedKeyboardEvent) => {
			this.resetRundown(e)
		}
		keyReloadRundown = (e: mousetrap.ExtendedKeyboardEvent) => {
			this.reloadRundownPlaylist(e)
		}
		keyMoveNextForward = (e: mousetrap.ExtendedKeyboardEvent) => {
			// "forward" = to next Part
			this.moveNext(e, 1, 0)
		}
		keyMoveNextBack = (e: mousetrap.ExtendedKeyboardEvent) => {
			// "down" = to next Segment
			this.moveNext(e, -1, 0)
		}
		keyMoveNextDown = (e: mousetrap.ExtendedKeyboardEvent) => {
			// "down" = to next Segment
			this.moveNext(e, 0, 1)
		}
		keyMoveNextUp = (e: mousetrap.ExtendedKeyboardEvent) => {
			// "down" = to next Segment
			this.moveNext(e, 0, -1)
		}
		keyDisableNextPiece = (e: mousetrap.ExtendedKeyboardEvent) => {
			this.disableNextPiece(e)
		}
		keyDisableNextPieceUndo = (e: mousetrap.ExtendedKeyboardEvent) => {
			this.disableNextPieceUndo(e)
		}
		keyLogError = (e: mousetrap.ExtendedKeyboardEvent) => {
			this.takeRundownSnapshot(e)
		}

		handleDisableNextPiece = (err: ClientAPI.ClientResponse<undefined>) => {
			if (ClientAPI.isClientResponseError(err)) {
				const { t } = this.props

				if (err.error === 404) {
					NotificationCenter.push(
						new Notification(
							undefined,
							NoticeLevel.WARNING,
							t('Could not find a Piece that can be disabled.'),
							'userAction'
						)
					)
					return false
				}
			}
		}

		disableNextPiece = (e: any) => {
			const { t } = this.props

			if (this.props.studioMode) {
				doUserAction(
					t,
					e,
					UserAction.DISABLE_NEXT_PIECE,
					(e) => MeteorCall.userAction.disableNextPiece(e, this.props.playlist._id, false),
					this.handleDisableNextPiece
				)
			}
		}

		disableNextPieceUndo = (e: any) => {
			const { t } = this.props

			if (this.props.studioMode) {
				doUserAction(
					t,
					e,
					UserAction.DISABLE_NEXT_PIECE,
					(e) => MeteorCall.userAction.disableNextPiece(e, this.props.playlist._id, true),
					this.handleDisableNextPiece
				)
			}
		}

		take = (e: any) => {
			const { t } = this.props
			if (this.props.studioMode) {
				doUserAction(t, e, UserAction.TAKE, (e) => MeteorCall.userAction.take(e, this.props.playlist._id))
			}
		}

		moveNext = (e: any, horizonalDelta: number, verticalDelta: number) => {
			const { t } = this.props
			if (this.props.studioMode) {
				if (this.props.playlist.active) {
					doUserAction(
						t,
						e,
						UserAction.MOVE_NEXT,
						(e) => MeteorCall.userAction.moveNext(e, this.props.playlist._id, horizonalDelta, verticalDelta),
						(err, partId) => {
							if (!err && partId) {
								scrollToPart(partId).catch((error) => {
									if (!error.toString().match(/another scroll/)) console.error(error)
								})
							}
						}
					)
				}
			}
		}

		discardError = () => {
			this.setState({
				isError: false,
			})
		}

		hold = (e: any) => {
			const { t } = this.props
			if (this.props.studioMode && this.props.playlist.active) {
				doUserAction(t, e, UserAction.ACTIVATE_HOLD, (e) =>
					MeteorCall.userAction.activateHold(e, this.props.playlist._id, false)
				)
			}
		}

		holdUndo = (e: any) => {
			const { t } = this.props
			if (
				this.props.studioMode &&
				this.props.playlist.active &&
				this.props.playlist.holdState === RundownHoldState.PENDING
			) {
				doUserAction(t, e, UserAction.ACTIVATE_HOLD, (e) =>
					MeteorCall.userAction.activateHold(e, this.props.playlist._id, true)
				)
			}
		}

		rundownShouldHaveStarted() {
			return getCurrentTime() > (this.props.playlist.expectedStart || 0)
		}
		rundownShouldHaveEnded() {
			return getCurrentTime() > (this.props.playlist.expectedStart || 0) + (this.props.playlist.expectedDuration || 0)
		}

		handleAnotherPlaylistActive = (
			playlistId: RundownPlaylistId,
			rehersal: boolean,
			err: ClientAPI.ClientResponseError,
			clb?: Function
		) => {
			const { t } = this.props

			function handleResult(err, response: void) {
				if (!err) {
					if (typeof clb === 'function') clb(response)
				} else {
					console.error(err)
					doModalDialog({
						title: t('Failed to activate'),
						message: t('Something went wrong, please contact the system administrator if the problem persists.'),
						acceptOnly: true,
						warning: true,
						yes: t('OK'),
						onAccept: () => {
							// nothing
						},
					})
				}
			}

			const otherRundowns = err.details as Rundown[]
			doModalDialog({
				title: t('Another Rundown is Already Active!'),
				message: t(
					'The rundown "{{rundownName}}" will need to be deactivated in order to activate this one.\n\nAre you sure you want to activate this one anyway?',
					{
						rundownName: otherRundowns.map((i) => i.name).join(', '),
					}
				),
				yes: t('Activate Anyway'),
				no: t('Cancel'),
				actions: [
					{
						label: t('Activate Anyway (GO ON AIR)'),
						classNames: 'btn-primary',
						on: (e) => {
							doUserAction(
								t,
								e,
								UserAction.DEACTIVATE_OTHER_RUNDOWN_PLAYLIST,
								(e) => MeteorCall.userAction.forceResetAndActivate(e, playlistId, false),
								handleResult
							)
						},
					},
				],
				warning: true,
				onAccept: (e) => {
					doUserAction(
						t,
						e,
						UserAction.DEACTIVATE_OTHER_RUNDOWN_PLAYLIST,
						(e) => MeteorCall.userAction.forceResetAndActivate(e, playlistId, rehersal),
						handleResult
					)
				},
			})
		}

		activate = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			if (
				this.props.studioMode &&
				(!this.props.playlist.active || (this.props.playlist.active && this.props.playlist.rehearsal))
			) {
				const onSuccess = () => {
					this.deferFlushAndRewindSegments()
					if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
				}
				const doActivate = () => {
					doUserAction(
						t,
						e,
						UserAction.ACTIVATE_RUNDOWN_PLAYLIST,
						(e) => MeteorCall.userAction.activate(e, this.props.playlist._id, false),
						(err) => {
							if (!err) {
								if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
							} else if (ClientAPI.isClientResponseError(err)) {
								if (err.error === 409) {
									this.handleAnotherPlaylistActive(this.props.playlist._id, false, err, () => {
										if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
									})
									return false
								}
							}
						}
					)
				}
				if (!this.rundownShouldHaveStarted()) {
					// The broadcast hasn't started yet
					doModalDialog({
						title: this.props.playlist.name,
						message: t('Do you want to activate this Rundown?'),
						onAccept: () => {
							this.rewindSegments()
							doUserAction(
								t,
								e,
								UserAction.RESET_AND_ACTIVATE_RUNDOWN_PLAYLIST,
								(e) => MeteorCall.userAction.resetAndActivate(e, this.props.playlist._id),
								(err) => {
									if (!err) {
										onSuccess()
									} else if (ClientAPI.isClientResponseError(err)) {
										if (err.error === 409) {
											this.handleAnotherPlaylistActive(this.props.playlist._id, false, err, onSuccess)
											return false
										}
									}
								}
							)
						},
					})
				} else if (!this.rundownShouldHaveEnded()) {
					// The broadcast has started
					doActivate()
				} else {
					// The broadcast has ended, going into active mode is probably not what you want to do
					doModalDialog({
						title: this.props.playlist.name,
						message: t('The planned end time has passed, are you sure you want to activate this Rundown?'),
						onAccept: () => {
							doActivate()
						},
					})
				}
			}
		}
		activateRehearsal = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			if (
				this.props.studioMode &&
				(!this.props.playlist.active || (this.props.playlist.active && !this.props.playlist.rehearsal))
			) {
				const onSuccess = () => {
					if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
				}
				let doActivateRehersal = () => {
					doUserAction(
						t,
						e,
						UserAction.ACTIVATE_RUNDOWN_PLAYLIST,
						(e) => MeteorCall.userAction.activate(e, this.props.playlist._id, true),
						(err) => {
							if (!err) {
								onSuccess()
							} else if (ClientAPI.isClientResponseError(err)) {
								if (err.error === 409) {
									this.handleAnotherPlaylistActive(this.props.playlist._id, true, err, onSuccess)
									return false
								}
							}
						}
					)
				}
				if (!this.rundownShouldHaveStarted()) {
					// The broadcast hasn't started yet
					if (!this.props.playlist.active) {
						// inactive, do the full preparation:
						doUserAction(
							t,
							e,
							UserAction.PREPARE_FOR_BROADCAST,
							(e) => MeteorCall.userAction.prepareForBroadcast(e, this.props.playlist._id),
							(err) => {
								if (!err) {
									onSuccess()
								} else if (ClientAPI.isClientResponseError(err)) {
									if (err.error === 409) {
										this.handleAnotherPlaylistActive(this.props.playlist._id, true, err, onSuccess)
										return false
									}
								}
							}
						)
					} else if (!this.props.playlist.rehearsal) {
						// Active, and not in rehearsal
						doModalDialog({
							title: this.props.playlist.name,
							message: t('Are you sure you want to activate Rehearsal Mode?'),
							onAccept: (e) => {
								doActivateRehersal()
							},
						})
					} else {
						// Already in rehersal, do nothing
					}
				} else {
					// The broadcast has started
					if (!this.rundownShouldHaveEnded()) {
						// We are in the broadcast
						doModalDialog({
							title: this.props.playlist.name,
							message: t('Are you sure you want to activate Rehearsal Mode?'),
							onAccept: (e) => {
								doActivateRehersal()
							},
						})
					} else {
						// The broadcast has ended
						doActivateRehersal()
					}
				}
			}
		}
		deactivate = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			if (this.props.studioMode && this.props.playlist.active) {
				if (this.rundownShouldHaveStarted()) {
					if (this.props.playlist.rehearsal) {
						// We're in rehearsal mode
						doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, (e) =>
							MeteorCall.userAction.deactivate(e, this.props.playlist._id)
						)
					} else {
						doModalDialog({
							title: this.props.playlist.name,
							message: t('Are you sure you want to deactivate this Rundown?\n(This will clear the outputs)'),
							warning: true,
							onAccept: () => {
								doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, (e) =>
									MeteorCall.userAction.deactivate(e, this.props.playlist._id)
								)
							},
						})
					}
				} else {
					// Do it right away
					doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, (e) =>
						MeteorCall.userAction.deactivate(e, this.props.playlist._id)
					)
				}
			}
		}

		resetRundown = (e: any) => {
			const { t } = this.props
			if (e.persist) e.persist()

			let doReset = () => {
				this.rewindSegments() // Do a rewind right away
				doUserAction(
					t,
					e,
					UserAction.RESET_RUNDOWN_PLAYLIST,
					(e) => MeteorCall.userAction.resetRundownPlaylist(e, this.props.playlist._id),
					() => {
						this.deferFlushAndRewindSegments()
					}
				)
			}
			if (this.props.playlist.active && !this.props.playlist.rehearsal && !Settings.allowRundownResetOnAir) {
				// The rundown is active and not in rehersal
				doModalDialog({
					title: this.props.playlist.name,
					message: t('The rundown can not be reset while it is active'),
					onAccept: () => {
						// nothing
					},
					acceptOnly: true,
					yes: 'OK',
				})
			} else {
				doReset()
			}
		}

		reloadRundownPlaylist = (e: any) => {
			const { t } = this.props
			if (this.props.studioMode) {
				doUserAction(
					t,
					e,
					UserAction.RELOAD_RUNDOWN_PLAYLIST_DATA,
					(e) => MeteorCall.userAction.resyncRundownPlaylist(e, this.props.playlist._id),
					(err, reloadResponse) => {
						if (!err && reloadResponse) {
							if (!handleRundownPlaylistReloadResponse(t, reloadResponse)) {
								if (this.props.playlist && this.props.playlist.nextPartInstanceId) {
									scrollToPartInstance(this.props.playlist.nextPartInstanceId).catch((error) => {
										if (!error.toString().match(/another scroll/)) console.error(error)
									})
								}
							}
						}
					}
				)
			}
		}

		takeRundownSnapshot = (e) => {
			const { t } = this.props
			if (this.props.studioMode) {
				const doneMessage = t('A snapshot of the current Running\xa0Order has been created for troubleshooting.')
				doUserAction(
					t,
					e,
					UserAction.CREATE_SNAPSHOT_FOR_DEBUG,
					(e) => MeteorCall.userAction.storeRundownSnapshot(e, this.props.playlist._id, 'Taken by user'),
					() => {
						NotificationCenter.push(
							new Notification(
								undefined,
								NoticeLevel.NOTIFICATION,
								doneMessage,
								'userAction',
								undefined,
								false,
								undefined,
								undefined,
								5000
							)
						)
						return false
					},
					doneMessage
				)
			}
		}

		resetAndActivateRundown = (e: any) => {
			// Called from the ModalDialog, 1 minute before broadcast starts
			if (this.props.studioMode) {
				const { t } = this.props
				this.rewindSegments() // Do a rewind right away

				doUserAction(
					t,
					e,
					UserAction.RESET_AND_ACTIVATE_RUNDOWN_PLAYLIST,
					(e) => MeteorCall.userAction.resetAndActivate(e, this.props.playlist._id),
					(err) => {
						if (!err) {
							this.deferFlushAndRewindSegments()
							if (typeof this.props.onActivate === 'function') this.props.onActivate(false)
						}
					}
				)
			}
		}

		rewindSegments() {
			RundownViewEventBus.emit(RundownViewEvents.REWIND_SEGMENTS)
		}
		deferFlushAndRewindSegments() {
			// Do a rewind later, when the UI has updated
			Meteor.defer(() => {
				Tracker.flush()
				Meteor.setTimeout(() => {
					this.rewindSegments()
					RundownViewEventBus.emit(RundownViewEvents.GO_TO_TOP)
				}, 500)
			})
		}

		render() {
			const { t } = this.props
			return (
				<React.Fragment>
					<Escape to="document">
						<ContextMenu id="rundown-context-menu">
							<div className="react-contextmenu-label">{this.props.playlist && this.props.playlist.name}</div>
							{this.props.studioMode ? (
								<React.Fragment>
									{!(this.props.playlist.active && this.props.playlist.rehearsal) ? (
										!this.rundownShouldHaveStarted() && !this.props.playlist.active ? (
											<MenuItem onClick={(e) => this.activateRehearsal(e)}>
												{t('Prepare Studio and Activate (Rehearsal)')}
											</MenuItem>
										) : (
											<MenuItem onClick={(e) => this.activateRehearsal(e)}>{t('Activate (Rehearsal)')}</MenuItem>
										)
									) : (
										<MenuItem onClick={(e) => this.activate(e)}>{t('Activate')}</MenuItem>
									)}
									{this.props.playlist.active ? (
										<MenuItem onClick={(e) => this.deactivate(e)}>{t('Deactivate')}</MenuItem>
									) : null}
									{this.props.playlist.active ? <MenuItem onClick={(e) => this.take(e)}>{t('Take')}</MenuItem> : null}
									{this.props.playlist.active ? <MenuItem onClick={(e) => this.hold(e)}>{t('Hold')}</MenuItem> : null}
									{!(
										this.props.playlist.active &&
										!this.props.playlist.rehearsal &&
										!Settings.allowRundownResetOnAir
									) ? (
										<MenuItem onClick={(e) => this.resetRundown(e)}>{t('Reset Rundown')}</MenuItem>
									) : null}
									<MenuItem onClick={(e) => this.reloadRundownPlaylist(e)}>
										{t('Reload {{nrcsName}} Data', {
											nrcsName: (this.props.firstRundown && this.props.firstRundown.externalNRCSName) || 'NRCS',
										})}
									</MenuItem>
									<MenuItem onClick={(e) => this.takeRundownSnapshot(e)}>{t('Store Snapshot')}</MenuItem>
								</React.Fragment>
							) : (
								<React.Fragment>
									<MenuItem>{t('No actions available')}</MenuItem>
								</React.Fragment>
							)}
						</ContextMenu>
					</Escape>
					<div
						className={ClassNames('header rundown', {
							active: this.props.playlist.active,
							'not-active': !this.props.playlist.active,
							rehearsal: this.props.playlist.rehearsal,
						})}>
						<ContextMenuTrigger
							id="rundown-context-menu"
							attributes={{
								className: 'flex-col col-timing horizontal-align-center',
							}}
							holdToDisplay={contextMenuHoldToDisplayTime()}>
							<WarningDisplay
								studioMode={this.props.studioMode}
								inActiveRundownView={this.props.inActiveRundownView}
								playlist={this.props.playlist}
								oneMinuteBeforeAction={this.resetAndActivateRundown}
							/>
							<div className="row first-row super-dark">
								<div className="flex-col left horizontal-align-left">
									<div className="badge mod">
										<Tooltip
											overlay={t('Add ?studio=1 to the URL to enter studio mode')}
											visible={getHelpMode() && !getAllowStudio()}
											placement="bottom">
											<div className="media-elem mrs sofie-logo" />
										</Tooltip>
										<div className="bd mls">
											<span className="logo-text"></span>
										</div>
									</div>
								</div>
								<div className="flex-col right horizontal-align-right">
									<div className="links mod close">
										<NavLink to="/rundowns">
											<CoreIcon.NrkClose />
										</NavLink>
									</div>
								</div>
								<TimingDisplay
									rundownPlaylist={this.props.playlist}
									currentRundown={this.props.currentRundown}
									rundownCount={this.props.rundownIds.length}
									layout={this.props.layout}
								/>
								<RundownSystemStatus
									studio={this.props.studio}
									playlist={this.props.playlist}
									rundownIds={this.props.rundownIds}
									firstRundown={this.props.firstRundown}
								/>
							</div>
						</ContextMenuTrigger>
					</div>
					<ModalDialog
						title={t('Error')}
						acceptText={t('OK')}
						show={!!this.state.isError}
						onAccept={this.discardError}
						onDiscard={this.discardError}>
						<p>{this.state.errorMessage}</p>
					</ModalDialog>
				</React.Fragment>
			)
		}
	}
)

interface IProps {
	match?: {
		params: {
			playlistId: RundownPlaylistId
		}
	}
	playlistId?: RundownPlaylistId
	inActiveRundownView?: boolean
	onlyShelf?: boolean
}

export interface IContextMenuContext {
	segment?: SegmentUi
	part?: PartUi | null

	partDocumentOffset?: OffsetPosition
	timeScale?: number
	mousePosition?: OffsetPosition
	partStartsAt?: number
}

interface IState {
	timeScale: number
	studioMode: boolean
	contextMenuContext: IContextMenuContext | null
	bottomMargin: string
	followLiveSegments: boolean
	manualSetAsNext: boolean
	subsReady: boolean
	usedHotkeys: Array<HotkeyDefinition>
	isNotificationsCenterOpen: NoticeLevel | undefined
	isSupportPanelOpen: boolean
	isInspectorShelfExpanded: boolean
	isClipTrimmerOpen: boolean
	selectedPiece: AdLibPieceUi | PieceUi | undefined
	shelfLayout: RundownLayoutShelfBase | undefined
	rundownViewLayout: RundownLayoutBase | undefined
	rundownHeaderLayout: RundownLayoutRundownHeader | undefined
	currentRundown: Rundown | undefined
	/** Tracks whether the user has resized the shelf to prevent using default shelf settings */
	wasShelfResizedByUser: boolean
	keyboardQueuedPiece: AdLibPieceUi | undefined
}

type MatchedSegment = {
	rundown: Rundown
	segments: Segment[]
	segmentIdsBeforeEachSegment: Set<SegmentId>[]
}

interface ITrackedProps {
	rundownPlaylistId: RundownPlaylistId
	rundowns: Rundown[]
	playlist?: RundownPlaylist
	matchedSegments: MatchedSegment[]
	studio?: Studio
	showStyleBase?: ShowStyleBase
	rundownLayouts?: Array<RundownLayoutBase>
	buckets: Bucket[]
	casparCGPlayoutDevices?: PeripheralDevice[]
	shelfLayoutId?: RundownLayoutId
	rundownViewLayoutId?: RundownLayoutId
	rundownHeaderLayoutId?: RundownLayoutId
	miniShelfLayoutId?: RundownLayoutId
	miniShelfLayout: RundownLayoutShelfBase | undefined
	miniShelfFilter: RundownLayoutFilterBase | undefined
	shelfDisplayOptions: {
		buckets: boolean
		layout: boolean
		inspector: boolean
	}
	bucketDisplayFilter: number[] | undefined
	currentPartInstance: PartInstance | undefined
	nextPartInstance: PartInstance | undefined
	uiSegmentMap: Map<SegmentId, AdlibSegmentUi>
	uiSegments: AdlibSegmentUi[]
	sourceLayerLookup: SourceLayerLookup
}
export const RundownView = translateWithTracker<IProps, IState, ITrackedProps>((props: Translated<IProps>) => {
	const { t, i18n, tReady } = props

	let playlistId
	if (props.match && props.match.params.playlistId) {
		playlistId = decodeURIComponent(unprotectString(props.match.params.playlistId))
	} else if (props.playlistId) {
		playlistId = props.playlistId
	}

	const playlist = RundownPlaylists.findOne(playlistId)
	let rundowns: Rundown[] = []
	let studio: Studio | undefined
	let currentPartInstance: PartInstance | undefined
	let nextPartInstance: PartInstance | undefined

	if (playlist) {
		studio = Studios.findOne({ _id: playlist.studioId })
		rundowns = memoizedIsolatedAutorun((_playlistId) => playlist.getRundowns(), 'playlist.getRundowns', playlistId)
		;({ currentPartInstance, nextPartInstance } = playlist.getSelectedPartInstances())
	}

	const params = queryStringParse(location.search)

	const displayOptions = ((params['display'] as string) || 'buckets,layout,shelfLayout,inspector').split(',')
	const bucketDisplayFilter = !(params['buckets'] as string)
		? undefined
		: (params['buckets'] as string).split(',').map((v) => parseInt(v))

	const showStyleBase = rundowns.length > 0 ? ShowStyleBases.findOne(rundowns[0].showStyleBaseId) : undefined
	let uiSegments: AdlibSegmentUi[] = []
	let sourceLayerLookup: SourceLayerLookup = {}

	const { rundownLayouts, miniShelfFilter, selectedMiniShelfLayout, miniShelfLayoutId } = memoizedIsolatedAutorun(
		(rundowns: Rundown[]) => {
			const rundownLayouts =
				rundowns.length > 0 ? RundownLayouts.find({ showStyleBaseId: rundowns[0].showStyleBaseId }).fetch() : undefined

			let selectedMiniShelfLayout: RundownLayoutBase | undefined = undefined
			const miniShelfLayoutId = protectString((params['miniShelfLayout'] as string) || '')

			if (rundownLayouts) {
				if (miniShelfLayoutId) {
					selectedMiniShelfLayout = rundownLayouts.find((i) => i._id === miniShelfLayoutId)
					if (!selectedMiniShelfLayout) {
						selectedMiniShelfLayout = rundownLayouts.find(
							(i) => i.name.indexOf(unprotectString(miniShelfLayoutId!)) >= 0
						)
					}
				}
				if (!selectedMiniShelfLayout) {
					selectedMiniShelfLayout = rundownLayouts.filter((i) => i.type === RundownLayoutType.MINI_SHELF_LAYOUT)[0]
				}
			}
			const miniShelfFilter = selectedMiniShelfLayout?.filters.find((filter) => RundownLayoutsAPI.isFilter(filter)) as
				| RundownLayoutFilterBase
				| undefined
			return { rundownLayouts, miniShelfFilter, selectedMiniShelfLayout, miniShelfLayoutId }
		},
		'getMiniShelfFilter',
		rundowns
	)

	const filteredUiSegmentMap = new Map<SegmentId, AdlibSegmentUi>()
	const filteredUiSegments: AdlibSegmentUi[] = []
	if (playlist && showStyleBase) {
		;({ uiSegments, sourceLayerLookup } = fetchAndFilter({
			t,
			i18n,
			tReady,
			playlist,
			showStyleBase,
			includeGlobalAdLibs: false,
			filter: miniShelfFilter,
		}))
		const liveSegment = uiSegments.find((i) => i.isLive === true)
		uiSegments.forEach((segment) => {
			const uniquenessIds = new Set<string>()
			const filteredPieces = segment.pieces.filter((piece) =>
				matchFilter(
					piece,
					showStyleBase,
					liveSegment,
					miniShelfFilter && {
						...miniShelfFilter,
						currentSegment: !(segment.isHidden && segment.showShelf) && miniShelfFilter.currentSegment,
					},
					undefined,
					uniquenessIds
				)
			)
			const filteredSegment = {
				...segment,
				pieces: filteredPieces,
			}
			filteredUiSegmentMap.set(segment._id, filteredSegment)
			filteredUiSegments.push(filteredSegment)
		})
	}

	// let rundownDurations = calculateDurations(rundown, parts)
	return {
		rundownPlaylistId: playlistId,
		rundowns,
		matchedSegments: playlist
			? playlist.getRundownsAndSegments().map((input, rundownIndex, rundownArray) => ({
					...input,
					segmentIdsBeforeEachSegment: input.segments.map(
						(segment, segmentIndex, segmentArray) =>
							new Set([
								...(_.flatten(
									rundownArray.slice(0, rundownIndex).map((match) => match.segments.map((segment) => segment._id))
								) as SegmentId[]),
								...segmentArray.slice(0, segmentIndex).map((segment) => segment._id),
							])
					),
			  }))
			: [],
		playlist,
		studio: studio,
		showStyleBase,
		rundownLayouts,
		buckets:
			(playlist &&
				Buckets.find(
					{
						studioId: playlist.studioId,
					},
					{
						sort: {
							_rank: 1,
						},
					}
				).fetch()) ||
			[],
		casparCGPlayoutDevices:
			(studio &&
				PeripheralDevices.find({
					parentDeviceId: {
						$in: PeripheralDevices.find({
							studioId: studio._id,
						})
							.fetch()
							.map((i) => i._id),
					},
					type: PeripheralDeviceAPI.DeviceType.PLAYOUT,
					subType: TSR.DeviceType.CASPARCG,
				}).fetch()) ||
			undefined,
		shelfLayoutId: protectString((params['layout'] as string) || (params['shelfLayout'] as string) || ''), // 'layout' kept for backwards compatibility
		rundownViewLayoutId: protectString((params['rundownViewLayout'] as string) || ''),
		rundownHeaderLayoutId: protectString((params['rundownHeaderLayout'] as string) || ''),
		miniShelfLayoutId,
		miniShelfLayout:
			selectedMiniShelfLayout && RundownLayoutsAPI.IsLayoutForMiniShelf(selectedMiniShelfLayout)
				? selectedMiniShelfLayout
				: undefined,
		miniShelfFilter,
		shelfDisplayOptions: {
			buckets: displayOptions.includes('buckets'),
			layout: displayOptions.includes('layout') || displayOptions.includes('shelfLayout'),
			inspector: displayOptions.includes('inspector'),
		},
		bucketDisplayFilter,
		currentPartInstance,
		nextPartInstance,
		uiSegmentMap: filteredUiSegmentMap,
		uiSegments: filteredUiSegments,
		sourceLayerLookup,
	}
})(
	class RundownView extends MeteorReactComponent<Translated<IProps & ITrackedProps>, IState> {
		private readonly LIVELINE_HISTORY_SIZE = 100

		private bindKeys: Array<{
			key: string
			up?: (e: KeyboardEvent) => any
			down?: (e: KeyboardEvent) => any
			label: string
			global?: boolean
		}> = []
		private usedArgumentKeys: Array<{
			key: string
			up?: (e: KeyboardEvent) => any
			down?: (e: KeyboardEvent) => any
			label: string
			global?: boolean
		}> = []
		private _segmentZoomOn: boolean = false
		private _hideNotificationsAfterMount: number | undefined

		constructor(props: Translated<IProps & ITrackedProps>) {
			super(props)

			const { t } = this.props

			this.bindKeys = [
				{
					key: RundownViewKbdShortcuts.RUNDOWN_GO_TO_LIVE,
					up: this.onGoToLiveSegment,
					label: t('Go to On Air line'),
					global: true,
				},
				{
					key: RundownViewKbdShortcuts.RUNDOWN_REWIND_SEGMENTS,
					up: this.onRewindSegments,
					label: t('Rewind segments to start'),
					global: true,
				},
				{
					key: RundownViewKbdShortcuts.MINISHELF_QUEUE_NEXT_ADLIB,
					up: this.keyQueueNextMinishelfAdLib,
					label: t('Queue next Minishelf AdLib'),
					global: true,
				},
				{
					key: RundownViewKbdShortcuts.MINISHELF_QUEUE_PREV_ADLIB,
					up: this.keyQueuePrevMinishelfAdLib,
					label: t('Queue previous Minishelf AdLib'),
					global: true,
				},
			]

			if (RundownViewKbdShortcuts.SHOW_CURRENT_SEGMENT_FULL_NONLATCH) {
				this.bindKeys.push({
					key: RundownViewKbdShortcuts.SHOW_CURRENT_SEGMENT_FULL_NONLATCH,
					down: this.onShowCurrentSegmentFullOn,
					up: this.onShowCurrentSegmentFullOff,
					label: t('Show entire current segment'),
					global: false,
				})
			}

			const shelfLayout = this.props.rundownLayouts?.find((layout) => layout._id === this.props.shelfLayoutId)
			let isInspectorShelfExpanded = false

			if (shelfLayout && RundownLayoutsAPI.IsLayoutForShelf(shelfLayout)) {
				isInspectorShelfExpanded = shelfLayout.openByDefault
			}

			this.state = {
				timeScale: MAGIC_TIME_SCALE_FACTOR * Settings.defaultTimeScale,
				studioMode: getAllowStudio(),
				contextMenuContext: null,
				bottomMargin: '',
				followLiveSegments: true,
				manualSetAsNext: false,
				subsReady: false,
				usedHotkeys: [...this.bindKeys].concat([
					// Register additional hotkeys or legend entries
					{
						key: 'Esc',
						label: t('Cancel currently pressed hotkey'),
					},
				]),
				isNotificationsCenterOpen: undefined,
				isSupportPanelOpen: false,
				isInspectorShelfExpanded,
				isClipTrimmerOpen: false,
				selectedPiece: undefined,
				shelfLayout: undefined,
				rundownViewLayout: undefined,
				rundownHeaderLayout: undefined,
				currentRundown: undefined,
				wasShelfResizedByUser: false,
				keyboardQueuedPiece: undefined,
			}
		}

		static getDerivedStateFromProps(props: Translated<IProps & ITrackedProps>): Partial<IState> {
			let selectedShelfLayout: RundownLayoutBase | undefined = undefined
			let selectedViewLayout: RundownLayoutBase | undefined = undefined
			let selectedHeaderLayout: RundownLayoutBase | undefined = undefined

			if (props.rundownLayouts) {
				// first try to use the one selected by the user
				if (props.shelfLayoutId) {
					selectedShelfLayout = props.rundownLayouts.find((i) => i._id === props.shelfLayoutId)
				}

				if (props.rundownViewLayoutId) {
					selectedViewLayout = props.rundownLayouts.find((i) => i._id === props.rundownViewLayoutId)
				}

				if (props.rundownHeaderLayoutId) {
					selectedHeaderLayout = props.rundownLayouts.find((i) => i._id === props.rundownHeaderLayoutId)
				}

				// if couldn't find based on id, try matching part of the name
				if (props.shelfLayoutId && !selectedShelfLayout) {
					selectedShelfLayout = props.rundownLayouts.find(
						(i) => i.name.indexOf(unprotectString(props.shelfLayoutId!)) >= 0
					)
				}

				if (props.rundownViewLayoutId && !selectedViewLayout) {
					selectedViewLayout = props.rundownLayouts.find(
						(i) => i.name.indexOf(unprotectString(props.rundownViewLayoutId!)) >= 0
					)
				}

				if (props.rundownHeaderLayoutId && !selectedHeaderLayout) {
					selectedHeaderLayout = props.rundownLayouts.find(
						(i) => i.name.indexOf(unprotectString(props.rundownHeaderLayoutId!)) >= 0
					)
				}

				// if not, try the first RUNDOWN_LAYOUT available
				if (!selectedShelfLayout) {
					selectedShelfLayout = props.rundownLayouts.find((i) => i.type === RundownLayoutType.RUNDOWN_LAYOUT)
				}

				// if still not found, use the first one
				if (!selectedShelfLayout) {
					selectedShelfLayout = props.rundownLayouts.filter((i) => RundownLayoutsAPI.IsLayoutForShelf(i))[0]
				}

				if (!selectedViewLayout) {
					selectedViewLayout = props.rundownLayouts.filter((i) => RundownLayoutsAPI.IsLayoutForRundownView(i))[0]
				}

				if (!selectedHeaderLayout) {
					selectedHeaderLayout = props.rundownLayouts.filter((i) => RundownLayoutsAPI.IsLayoutForRundownHeader(i))[0]
				}
			}

			let currentRundown: Rundown | undefined = undefined
			if (props.playlist && props.rundowns.length > 0 && (props.currentPartInstance || props.nextPartInstance)) {
				currentRundown = props.rundowns.find((rundown) => rundown._id === props.currentPartInstance?.rundownId)
				if (!currentRundown) {
					currentRundown = props.rundowns.find((rundown) => rundown._id === props.nextPartInstance?.rundownId)
				}
			}

			return {
				shelfLayout:
					selectedShelfLayout && RundownLayoutsAPI.IsLayoutForShelf(selectedShelfLayout)
						? selectedShelfLayout
						: undefined,
				rundownViewLayout: selectedViewLayout,
				rundownHeaderLayout:
					selectedHeaderLayout && RundownLayoutsAPI.IsLayoutForRundownHeader(selectedHeaderLayout)
						? selectedHeaderLayout
						: undefined,
				currentRundown,
			}
		}

		componentDidMount() {
			let playlistId = this.props.rundownPlaylistId

			this.subscribe(PubSub.rundownPlaylists, {
				_id: playlistId,
			})
			this.subscribe(PubSub.rundowns, {
				playlistId,
			})
			this.autorun(() => {
				let playlist = RundownPlaylists.findOne(playlistId, {
					fields: {
						_id: 1,
						studioId: 1,
					},
				}) as Pick<RundownPlaylist, '_id' | 'studioId'> | undefined
				if (playlist) {
					this.subscribe(PubSub.studios, {
						_id: playlist.studioId,
					})
					this.subscribe(PubSub.buckets, {
						studioId: playlist.studioId,
					})
				}
			})

			this.autorun(() => {
				let playlist = RundownPlaylists.findOne(playlistId, {
					fields: {
						_id: 1,
					},
				}) as Pick<RundownPlaylist, '_id' | 'getRundowns'> | undefined
				if (playlist) {
					const rundowns = playlist.getRundowns(undefined, {
						fields: {
							_id: 1,
							showStyleBaseId: 1,
						},
					}) as Pick<Rundown, '_id' | 'showStyleBaseId'>[]
					this.subscribe(PubSub.showStyleBases, {
						_id: {
							$in: rundowns.map((i) => i.showStyleBaseId),
						},
					})
					this.subscribe(PubSub.rundownLayouts, {
						showStyleBaseId: {
							$in: rundowns.map((i) => i.showStyleBaseId),
						},
					})
					const rundownIDs = rundowns.map((i) => i._id)
					this.subscribe(PubSub.segments, {
						rundownId: {
							$in: rundownIDs,
						},
					})
					this.subscribe(PubSub.adLibPieces, {
						rundownId: {
							$in: rundownIDs,
						},
					})
					this.subscribe(PubSub.rundownBaselineAdLibPieces, {
						rundownId: {
							$in: rundownIDs,
						},
					})
					this.subscribe(PubSub.adLibActions, {
						rundownId: {
							$in: rundownIDs,
						},
					})
					this.subscribe(PubSub.rundownBaselineAdLibActions, {
						rundownId: {
							$in: rundownIDs,
						},
					})
					this.subscribe(PubSub.parts, {
						rundownId: {
							$in: rundownIDs,
						},
					})
					this.subscribe(PubSub.partInstances, {
						rundownId: {
							$in: rundownIDs,
						},
						reset: {
							$ne: true,
						},
					})
				}
			})
			this.autorun(() => {
				let playlist = RundownPlaylists.findOne(playlistId, {
					fields: {
						currentPartInstanceId: 1,
						nextPartInstanceId: 1,
						previousPartInstanceId: 1,
					},
				}) as
					| Pick<
							RundownPlaylist,
							| '_id'
							| 'currentPartInstanceId'
							| 'nextPartInstanceId'
							| 'previousPartInstanceId'
							| 'getRundownUnorderedIDs'
					  >
					| undefined
				if (playlist) {
					const rundownIds = playlist.getRundownUnorderedIDs()
					// Use Meteor.subscribe so that this subscription doesn't mess with this.subscriptionsReady()
					// it's run in this.autorun, so the subscription will be stopped along with the autorun,
					// so we don't have to manually clean up after ourselves.
					Meteor.subscribe(PubSub.pieceInstances, {
						rundownId: {
							$in: rundownIds,
						},
						partInstanceId: {
							$in: [
								playlist.currentPartInstanceId,
								playlist.nextPartInstanceId,
								playlist.previousPartInstanceId,
							].filter((p) => p !== null),
						},
						reset: {
							$ne: true,
						},
					})
				}
			})
			this.autorun(() => {
				let subsReady = this.subscriptionsReady()
				if (subsReady !== this.state.subsReady) {
					this.setState({
						subsReady: subsReady,
					})
				}
			})

			document.body.classList.add('dark', 'vertical-overflow-only')

			let preventDefault = (e) => {
				e.preventDefault()
				e.stopImmediatePropagation()
				e.stopPropagation()
			}
			this.bindKeys.forEach((k) => {
				const method = k.global ? mousetrap.bindGlobal : mousetrap.bind
				if (k.up) {
					method(
						k.key,
						(e: KeyboardEvent) => {
							if (k.up) k.up(e)
						},
						'keyup'
					)
					method(
						k.key,
						(e: KeyboardEvent) => {
							preventDefault(e)
						},
						'keydown'
					)
				}
				if (k.down) {
					method(
						k.key,
						(e: KeyboardEvent) => {
							if (k.down) k.down(e)
						},
						'keydown'
					)
				}
			})

			rundownNotificationHandler.set(this.onRONotificationClick)

			RundownViewEventBus.on(RundownViewEvents.GO_TO_LIVE_SEGMENT, this.onGoToLiveSegment)
			RundownViewEventBus.on(RundownViewEvents.GO_TO_TOP, this.onGoToTop)

			if (this.props.playlist) {
				documentTitle.set(this.props.playlist.name)
			}

			const themeColor = document.head.querySelector('meta[name="theme-color"]')
			if (themeColor) {
				themeColor.setAttribute('data-content', themeColor.getAttribute('content') || '')
				themeColor.setAttribute('content', '#000000')
			}

			// Snooze notifications for a period after mounting the RundownView
			if (HIDE_NOTIFICATIONS_AFTER_MOUNT) {
				NotificationCenter.isOpen = true
				this._hideNotificationsAfterMount = Meteor.setTimeout(() => {
					NotificationCenter.isOpen = this.state.isNotificationsCenterOpen !== undefined
					this._hideNotificationsAfterMount = undefined
				}, HIDE_NOTIFICATIONS_AFTER_MOUNT)
			}
			NotificationCenter.isConcentrationMode = true
		}

		componentDidUpdate(prevProps: IProps & ITrackedProps, prevState: IState) {
			if (
				this.props.playlist &&
				prevProps.playlist &&
				prevProps.playlist.currentPartInstanceId !== this.props.playlist.currentPartInstanceId &&
				this.state.manualSetAsNext
			) {
				// reset followLiveSegments after a manual set as next
				this.setState({
					manualSetAsNext: false,
					followLiveSegments: true,
				})
				if (this.props.playlist.currentPartInstanceId) {
					scrollToPartInstance(this.props.playlist.currentPartInstanceId, true).catch((error) => {
						if (!error.toString().match(/another scroll/)) console.error(error)
					})
				}
			} else if (
				this.props.playlist &&
				prevProps.playlist &&
				prevProps.playlist.active &&
				!this.props.playlist.active
			) {
				// reset followLiveSegments after deactivating a rundown
				this.setState({
					followLiveSegments: true,
				})
			} else if (
				this.props.playlist &&
				prevProps.playlist &&
				!prevProps.playlist.active &&
				this.props.playlist.active &&
				this.props.playlist.nextPartInstanceId
			) {
				// scroll to next after activation
				scrollToPartInstance(this.props.playlist.nextPartInstanceId).catch((error) => {
					if (!error.toString().match(/another scroll/)) console.error(error)
				})
			} else if (
				// after take
				this.props.playlist &&
				prevProps.playlist &&
				this.props.playlist.currentPartInstanceId !== prevProps.playlist.currentPartInstanceId &&
				this.props.playlist.currentPartInstanceId &&
				this.state.followLiveSegments
			) {
				scrollToPartInstance(this.props.playlist.currentPartInstanceId, true).catch((error) => {
					if (!error.toString().match(/another scroll/)) console.error(error)
				})
			} else if (
				// initial Rundown open
				this.props.playlist &&
				this.props.playlist.currentPartInstanceId &&
				this.state.subsReady &&
				!prevState.subsReady
			) {
				// allow for some time for the Rundown to render
				maintainFocusOnPartInstance(this.props.playlist.currentPartInstanceId, 7000, true, true)
			}

			if (
				typeof this.props.playlist !== typeof prevProps.playlist ||
				(this.props.playlist || { _id: '' })._id !== (prevProps.playlist || { _id: '' })._id ||
				(this.props.playlist || { active: false }).active !== (prevProps.playlist || { active: false }).active ||
				this.state.studioMode !== prevState.studioMode
			) {
				if (this.props.playlist && this.props.playlist.active && this.state.studioMode && !getAllowDeveloper()) {
					window.addEventListener('beforeunload', this.onBeforeUnload)
				} else {
					window.removeEventListener('beforeunload', this.onBeforeUnload)
				}
			}

			if (
				typeof this.props.playlist !== typeof prevProps.playlist ||
				(this.props.playlist || { name: '' }).name !== (prevProps.playlist || { name: '' }).name
			) {
				if (this.props.playlist && this.props.playlist.name) {
					documentTitle.set(this.props.playlist.name)
				} else {
					documentTitle.set(null)
				}
			}
			if (Settings.enableUserAccounts && getAllowStudio() !== this.state.studioMode) {
				this.setState({ studioMode: getAllowStudio() })
			}
			if (this.props.currentPartInstance?.segmentId !== prevProps.currentPartInstance?.segmentId) {
				this.setState({ keyboardQueuedPiece: undefined })
			}
		}

		refreshHotkeys = () => {
			const { t } = this.props
			let preventDefault = (e) => {
				e.preventDefault()
				e.stopImmediatePropagation()
				e.stopPropagation()
			}
			const noOp = (e) => {
				preventDefault(e)
			}
			this.usedArgumentKeys = []

			const HOTKEY_GROUP = 'RuntimeArguments'

			RegisteredHotkeys.remove({
				tag: HOTKEY_GROUP,
			})
			this.usedArgumentKeys.forEach((k) => {
				if (k.up) {
					mousetrapHelper.unbind(k.key, 'RuntimeArguments', 'keyup')
					mousetrapHelper.unbind(k.key, 'RuntimeArguments', 'keydown')
				}
				if (k.down) {
					mousetrapHelper.unbind(k.key, 'RuntimeArguments', 'keydown')
				}
			})
			this.usedArgumentKeys = []
		}

		onSelectPiece = (piece: PieceUi) => {
			if (piece) {
				const vtContent = piece.instance.piece.content as VTContent | undefined
				if (
					vtContent &&
					vtContent.editable &&
					(vtContent.editable.editorialDuration !== undefined || vtContent.editable.editorialStart !== undefined)
				) {
					this.setState({
						isClipTrimmerOpen: true,
						selectedPiece: piece,
					})
				} else {
					RundownViewEventBus.emit(RundownViewEvents.SELECT_PIECE, {
						piece,
					})
				}
			}
		}

		componentWillUnmount() {
			this._cleanUp()
			document.body.classList.remove('dark', 'vertical-overflow-only')
			// window.removeEventListener('scroll', this.onWindowScroll)
			window.removeEventListener('beforeunload', this.onBeforeUnload)

			this.bindKeys.forEach((k) => {
				if (k.up) {
					mousetrap.unbind(k.key, 'keyup')
					mousetrap.unbind(k.key, 'keydown')
				}
				if (k.down) {
					mousetrap.unbind(k.key, 'keydown')
				}
			})

			documentTitle.set(null)

			const themeColor = document.head.querySelector('meta[name="theme-color"]')
			if (themeColor) {
				themeColor.setAttribute('content', themeColor.getAttribute('data-content') || '#ffffff')
			}

			if (this._hideNotificationsAfterMount) {
				Meteor.clearTimeout(this._hideNotificationsAfterMount)
			}
			NotificationCenter.isConcentrationMode = false

			RundownViewEventBus.off(RundownViewEvents.GO_TO_LIVE_SEGMENT, this.onGoToLiveSegment)
			RundownViewEventBus.off(RundownViewEvents.GO_TO_TOP, this.onGoToTop)
		}

		onBeforeUnload = (e: any) => {
			const { t } = this.props

			e.preventDefault()
			e.returnValue = t('This rundown is now active. Are you sure you want to exit this screen?')

			return t('This rundown is now active. Are you sure you want to exit this screen?')
		}

		onRewindSegments = () => {
			RundownViewEventBus.emit(RundownViewEvents.REWIND_SEGMENTS)
		}

		keyQueueNextMinishelfAdLib = (e: mousetrap.ExtendedKeyboardEvent) => {
			this.queueNextMinishelfAdLib(e)
		}
		keyQueuePrevMinishelfAdLib = (e: mousetrap.ExtendedKeyboardEvent) => {
			this.queuePrevMinishelfAdLib(e)
		}

		onShowCurrentSegmentFullOn = () => {
			if (this._segmentZoomOn === false) {
				console.log(`Dispatching event: ${RundownViewEvents.SEGMENT_ZOOM_ON}`)
				RundownViewEventBus.emit(RundownViewEvents.SEGMENT_ZOOM_ON)
				this._segmentZoomOn = true
			}
		}

		onShowCurrentSegmentFullOff = () => {
			console.log(`Dispatching event: ${RundownViewEvents.SEGMENT_ZOOM_OFF}`)
			RundownViewEventBus.emit(RundownViewEvents.SEGMENT_ZOOM_OFF)
			this._segmentZoomOn = false
		}

		onTimeScaleChange = (timeScaleVal) => {
			if (Number.isFinite(timeScaleVal) && timeScaleVal > 0) {
				this.setState({
					timeScale: timeScaleVal,
				})
			}
		}

		onSegmentScroll = () => {
			if (this.state.followLiveSegments && this.props.playlist && this.props.playlist.active) {
				this.setState({
					followLiveSegments: false,
				})
			}
		}

		// onWindowScroll = (e: Event) => {
		// 	console.log('Scroll handler')
		// 	const isAutoScrolling = document.body.classList.contains('auto-scrolling')
		// 	if (this.state.followLiveSegments && !isAutoScrolling && this.props.rundown && this.props.rundown.active) {
		// 		this.setState({
		// 			followLiveSegments: false
		// 		})
		// 	}
		// }

		onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
			if (!e.altKey && e.ctrlKey && !e.shiftKey && !e.metaKey && e.deltaY !== 0) {
				this.onTimeScaleChange(Math.min(500, this.state.timeScale * (1 + 0.001 * (e.deltaY * -1))))
				e.preventDefault()
			}
		}

		onGoToTop = () => {
			scrollToPosition(0).catch((error) => {
				if (!error.toString().match(/another scroll/)) console.error(error)
			})

			window.requestIdleCallback(
				() => {
					this.setState({
						followLiveSegments: true,
					})
				},
				{ timeout: 1000 }
			)
		}
		onGoToLiveSegment = () => {
			if (
				this.props.playlist &&
				this.props.playlist.active &&
				!this.props.playlist.currentPartInstanceId &&
				this.props.playlist.nextPartInstanceId
			) {
				this.setState({
					followLiveSegments: true,
				})
				scrollToPartInstance(this.props.playlist.nextPartInstanceId, true).catch((error) => {
					if (!error.toString().match(/another scroll/)) console.error(error)
				})
				setTimeout(() => {
					this.setState({
						followLiveSegments: true,
					})
					RundownViewEventBus.emit(RundownViewEvents.REWIND_SEGMENTS)
				}, 2000)
			} else if (this.props.playlist && this.props.playlist.active && this.props.playlist.currentPartInstanceId) {
				this.setState({
					followLiveSegments: true,
				})
				scrollToPartInstance(this.props.playlist.currentPartInstanceId, true).catch((error) => {
					if (!error.toString().match(/another scroll/)) console.error(error)
				})
				setTimeout(() => {
					this.setState({
						followLiveSegments: true,
					})
					RundownViewEventBus.emit(RundownViewEvents.REWIND_SEGMENTS)
				}, 2000)
			} else {
				this.setState({
					followLiveSegments: true,
				})
			}
		}

		onActivate = () => {
			this.onGoToLiveSegment()
		}

		onContextMenu = (contextMenuContext: IContextMenuContext) => {
			this.setState({
				contextMenuContext,
			})
		}

		onSetNext = (part: Part, e: any, offset?: number, take?: boolean) => {
			const { t } = this.props
			if (this.state.studioMode && part && part._id && this.props.playlist) {
				const playlistId = this.props.playlist._id
				doUserAction(
					t,
					e,
					UserAction.SET_NEXT,
					(e) => MeteorCall.userAction.setNext(e, playlistId, part._id, offset),
					(err) => {
						this.setState({
							manualSetAsNext: true,
						})
						if (!err && take && this.props.playlist) {
							const playlistId = this.props.playlist._id
							doUserAction(t, e, UserAction.TAKE, (e) => MeteorCall.userAction.take(e, playlistId))
						}
					}
				)
			}
		}
		onSetNextSegment = (segmentId: SegmentId | null, e: any) => {
			const { t } = this.props
			if (this.state.studioMode && (segmentId || segmentId === null) && this.props.playlist) {
				const playlistId = this.props.playlist._id
				doUserAction(
					t,
					e,
					UserAction.SET_NEXT,
					(e) => MeteorCall.userAction.setNextSegment(e, playlistId, segmentId),
					(err, res) => {
						if (err) console.error(err)
						this.setState({
							manualSetAsNext: true,
						})
					}
				)
			}
		}

		onResyncSegment = (segment: SegmentUi, e: any) => {
			const { t } = this.props
			if (this.state.studioMode && this.props.rundownPlaylistId) {
				doUserAction(t, e, UserAction.RESYNC_SEGMENT, (e) =>
					MeteorCall.userAction.resyncSegment(e, segment.rundownId, segment._id)
				)
			}
		}

		onPieceDoubleClick = (item: PieceUi, e: React.MouseEvent<HTMLDivElement>) => {
			const { t } = this.props
			if (
				this.state.studioMode &&
				item &&
				item.instance &&
				this.props.playlist &&
				this.props.playlist.currentPartInstanceId
			) {
				const idToCopy = item.instance.isTemporary ? item.instance.piece._id : item.instance._id
				const playlistId = this.props.playlist._id
				const currentPartInstanceId = this.props.playlist.currentPartInstanceId
				doUserAction(t, e, UserAction.TAKE_PIECE, (e) =>
					MeteorCall.userAction.pieceTakeNow(e, playlistId, currentPartInstanceId, idToCopy)
				)
			}
		}

		onRONotificationClick = (e: RONotificationEvent) => {
			if (e.sourceLocator) {
				let segmentId = e.sourceLocator.segmentId

				if (!segmentId) {
					if (e.sourceLocator.partId) {
						let part = Parts.findOne(e.sourceLocator.partId)
						if (part) {
							segmentId = part.segmentId
						}
					}
				}
				if (segmentId) {
					scrollToSegment(segmentId)
						.then(() => {
							RundownViewEventBus.emit(RundownViewEvents.HIGHLIGHT, e.sourceLocator)
						})
						.catch((error) => {
							if (!error.toString().match(/another scroll/)) console.error(error)
						})
				}
			}
		}
		onHeaderNoteClick = (segmentId: SegmentId, level: NoteType) => {
			NotificationCenter.snoozeAll()
			const isOpen = this.state.isNotificationsCenterOpen
			this.setState({
				isNotificationsCenterOpen: level === NoteType.ERROR ? NoticeLevel.CRITICAL : NoticeLevel.WARNING,
			})
			setTimeout(
				function() {
					NotificationCenter.highlightSource(
						segmentId,
						level === NoteType.ERROR ? NoticeLevel.CRITICAL : NoticeLevel.WARNING
					)
				},
				isOpen ? 1 : 1000
			)
		}

		onToggleSupportPanel = () => {
			this.setState({
				isSupportPanelOpen: !this.state.isSupportPanelOpen,
			})
		}

		onStudioRouteSetSwitch = (
			e: React.MouseEvent<HTMLElement, MouseEvent>,
			routeSetId: string,
			routeSet: StudioRouteSet,
			state: boolean
		) => {
			const { t } = this.props
			if (this.props.studio) {
				doUserAction(t, e, UserAction.SWITCH_ROUTE_SET, (e) =>
					MeteorCall.userAction.switchRouteSet(e, this.props.studio!._id, routeSetId, state)
				)
			}
		}

		renderSegments() {
			if (this.props.matchedSegments) {
				let globalIndex = 0
				return this.props.matchedSegments.map((rundownAndSegments, rundownIndex, rundownArray) => (
					<React.Fragment key={unprotectString(rundownAndSegments.rundown._id)}>
						{this.props.matchedSegments.length > 1 && (
							<RundownDividerHeader
								key={`rundown_${rundownAndSegments.rundown._id}`}
								rundown={rundownAndSegments.rundown}
								playlist={this.props.playlist!}
							/>
						)}
						{rundownAndSegments.segments.map((segment, segmentIndex, segmentArray) => {
							if (this.props.studio && this.props.playlist && this.props.showStyleBase) {
								return (
									<ErrorBoundary key={unprotectString(segment._id)}>
										<VirtualElement
											id={SEGMENT_TIMELINE_ELEMENT_ID + segment._id}
											className={ClassNames({
												'segment-timeline-wraper--hidden': segment.isHidden,
												'segment-timeline-wraper--shelf': segment.showShelf,
											})}
											margin={'100% 0px 100% 0px'}
											initialShow={globalIndex++ < window.innerHeight / 260}
											placeholderHeight={260}
											placeholderClassName="placeholder-shimmer-element segment-timeline-placeholder"
											width="auto">
											<SegmentTimelineContainer
												id={SEGMENT_TIMELINE_ELEMENT_ID + segment._id}
												studio={this.props.studio}
												showStyleBase={this.props.showStyleBase}
												followLiveSegments={this.state.followLiveSegments}
												rundownId={rundownAndSegments.rundown._id}
												segmentId={segment._id}
												adLibSegmentUi={this.props.uiSegmentMap.get(segment._id)}
												playlist={this.props.playlist}
												liveLineHistorySize={this.LIVELINE_HISTORY_SIZE}
												timeScale={this.state.timeScale}
												onTimeScaleChange={this.onTimeScaleChange}
												onContextMenu={this.onContextMenu}
												onSegmentScroll={this.onSegmentScroll}
												segmentsIdsBefore={rundownAndSegments.segmentIdsBeforeEachSegment[segmentIndex]}
												isLastSegment={
													rundownIndex === rundownArray.length - 1 && segmentIndex === segmentArray.length - 1
												}
												onPieceClick={this.onSelectPiece}
												onPieceDoubleClick={this.onPieceDoubleClick}
												onHeaderNoteClick={this.onHeaderNoteClick}
												ownCurrentPartInstance={
													// feed the currentPartInstance into the SegmentTimelineContainer component, if the currentPartInstance
													// is a part of the segment
													(this.props.currentPartInstance &&
														this.props.currentPartInstance.segmentId === segment._id) ||
													// or the nextPartInstance is a part of this segment, and the currentPartInstance is autoNext
													(this.props.nextPartInstance &&
														this.props.nextPartInstance.segmentId === segment._id &&
														this.props.currentPartInstance &&
														this.props.currentPartInstance.part.autoNext)
														? this.props.currentPartInstance
														: undefined
												}
												ownNextPartInstance={
													this.props.nextPartInstance && this.props.nextPartInstance.segmentId === segment._id
														? this.props.nextPartInstance
														: undefined
												}
												studioMode={this.state.studioMode}
												miniShelfFilter={this.props.miniShelfFilter}
											/>
										</VirtualElement>
									</ErrorBoundary>
								)
							}
						})}
					</React.Fragment>
				))
			} else {
				return <div></div>
			}
		}

		renderSegmentsList() {
			if (this.props.playlist && this.props.rundowns.length) {
				return (
					<React.Fragment>
						{this.props.playlist?.loop && (
							<PlaylistLoopingHeader position="start" multiRundown={this.props.matchedSegments.length > 1} />
						)}
						<div className="segment-timeline-container">{this.renderSegments()}</div>
						{this.props.playlist?.loop && (
							<PlaylistLoopingHeader position="end" multiRundown={this.props.matchedSegments.length > 1} />
						)}
					</React.Fragment>
				)
			} else {
				return (
					<div className="mod">
						<Spinner />
					</div>
				)
			}
		}

		onChangeBottomMargin = (newBottomMargin: string) => {
			this.setState({
				bottomMargin: newBottomMargin,
			})
		}

		onRegisterHotkeys = (hotkeys: Array<HotkeyDefinition>) => {
			// @ts-ignore
			this.state.usedHotkeys = this.state.usedHotkeys.concat(hotkeys) // we concat directly to the state object member, because we need to
			this.setState({
				usedHotkeys: this.state.usedHotkeys,
			})

			const HOTKEY_TAG = 'RundownView'

			RegisteredHotkeys.remove({
				tag: HOTKEY_TAG,
			})

			function noop() {}

			this.state.usedHotkeys.forEach((hotkey) => {
				registerHotkey(
					hotkey.key,
					hotkey.label,
					HotkeyAssignmentType.SYSTEM,
					undefined,
					false,
					hotkey.up || hotkey.down || noop,
					undefined,
					HOTKEY_TAG
				)
			})
		}

		onContextMenuTop = (e: React.MouseEvent<HTMLDivElement>): boolean => {
			if (!getAllowDeveloper()) {
				e.preventDefault()
				e.stopPropagation()
			}
			return false
		}

		onToggleNotifications = (e: React.MouseEvent<HTMLElement>, filter: NoticeLevel) => {
			if (!this.state.isNotificationsCenterOpen === true) {
				NotificationCenter.highlightSource(undefined, NoticeLevel.CRITICAL)
			}

			NotificationCenter.isOpen = !(this.state.isNotificationsCenterOpen === filter)

			this.setState({
				isNotificationsCenterOpen: this.state.isNotificationsCenterOpen === filter ? undefined : filter,
			})
		}

		onToggleHotkeys = () => {
			if (!this.state.isInspectorShelfExpanded) {
				this.setState({
					isInspectorShelfExpanded: true,
				})
				RundownViewEventBus.emit(RundownViewEvents.SWITCH_SHELF_TAB, {
					tab: ShelfTabs.SYSTEM_HOTKEYS,
				})
			} else {
				this.setState({
					isInspectorShelfExpanded: false,
				})
			}

			this.setState({
				wasShelfResizedByUser: true,
			})
		}

		onRestartPlayout = (e: React.MouseEvent<HTMLButtonElement>) => {
			const { t } = this.props

			if (this.props.studio) {
				const attachedPlayoutGateways = PeripheralDevices.find({
					studioId: this.props.studio._id,
					connected: true,
					type: PeripheralDeviceAPI.DeviceType.PLAYOUT,
				}).fetch()
				if (attachedPlayoutGateways.length === 0) {
					NotificationCenter.push(
						new Notification(
							undefined,
							NoticeLevel.CRITICAL,
							t(
								'There are no Playout\xa0Gateways connected and attached to this studio. Please contact the system administrator to start the Playout Gateway.'
							),
							'RundownView'
						)
					)
					return
				}
				attachedPlayoutGateways.forEach((item) => {
					PeripheralDevicesAPI.restartDevice(item, e)
						.then(() => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.NOTIFICATION,
									t('Playout\xa0Gateway "{{playoutDeviceName}}" is now restarting.', { playoutDeviceName: item.name }),
									'RundownView'
								)
							)
						})
						.catch(() => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.CRITICAL,
									t('Could not restart Playout\xa0Gateway "{{playoutDeviceName}}".', { playoutDeviceName: item.name }),
									'RundownView'
								)
							)
						})
				})
			}
		}

		onRestartCasparCG = (device: PeripheralDevice) => {
			const { t } = this.props

			doModalDialog({
				title: t('Restart CasparCG Server'),
				message: t('Do you want to restart CasparCG Server "{{device}}"?', { device: device.name }),
				onAccept: (event: any) => {
					callPeripheralDeviceFunction(event, device._id, CASPARCG_RESTART_TIME, 'restartCasparCG')
						.then(() => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.NOTIFICATION,
									t('CasparCG on device "{{deviceName}}" restarting...', { deviceName: device.name }),
									'SystemStatus'
								)
							)
						})
						.catch((err) => {
							NotificationCenter.push(
								new Notification(
									undefined,
									NoticeLevel.WARNING,
									t('Failed to restart CasparCG on device: "{{deviceName}}": {{errorMessage}}', {
										deviceName: device.name,
										errorMessage: err + '',
									}),
									'SystemStatus'
								)
							)
						})
				},
			})
		}

		onTakeRundownSnapshot = (e: React.MouseEvent<HTMLButtonElement>) => {
			const { t } = this.props
			if (this.props.playlist) {
				const playlistId = this.props.playlist._id
				const doneMessage = t('A snapshot of the current Running\xa0Order has been created for troubleshooting.')
				doUserAction(
					t,
					e,
					UserAction.CREATE_SNAPSHOT_FOR_DEBUG,
					(e) => MeteorCall.userAction.storeRundownSnapshot(e, playlistId, 'User requested log at' + getCurrentTime()),
					() => {
						NotificationCenter.push(
							new Notification(
								undefined,
								NoticeLevel.NOTIFICATION,
								doneMessage,
								'userAction',
								undefined,
								false,
								undefined,
								undefined,
								5000
							)
						)
						return false
					},
					doneMessage
				)
			}
		}

		queueAdLibPiece = (adlibPiece: AdLibPieceUi, e: any) => {
			const { t } = this.props

			let sourceLayer = this.props.sourceLayerLookup[adlibPiece.sourceLayerId]

			if (this.props.playlist && this.props.playlist.currentPartInstanceId) {
				const currentPartInstanceId = this.props.playlist.currentPartInstanceId
				if (!(sourceLayer && sourceLayer.clearKeyboardHotkey)) {
					if (adlibPiece.isAction && adlibPiece.adlibAction) {
						const action = adlibPiece.adlibAction
						doUserAction(t, e, adlibPiece.isGlobal ? UserAction.START_GLOBAL_ADLIB : UserAction.START_ADLIB, (e) =>
							MeteorCall.userAction.executeAction(e, this.props.playlist!._id, action.actionId, action.userData)
						)
					} else if (!adlibPiece.isGlobal && !adlibPiece.isAction) {
						doUserAction(t, e, UserAction.START_ADLIB, (e) =>
							MeteorCall.userAction.segmentAdLibPieceStart(
								e,
								this.props.playlist!._id,
								currentPartInstanceId,
								adlibPiece._id,
								true
							)
						)
					} else if (adlibPiece.isGlobal && !adlibPiece.isSticky) {
						doUserAction(t, e, UserAction.START_GLOBAL_ADLIB, (e) =>
							MeteorCall.userAction.baselineAdLibPieceStart(
								e,
								this.props.playlist!._id,
								currentPartInstanceId,
								adlibPiece._id,
								true
							)
						)
					} else if (adlibPiece.isSticky) {
						// this.onToggleSticky(adlibPiece.sourceLayerId, e)
					}
				} else {
					// if (sourceLayer && sourceLayer.clearKeyboardHotkey) {
					// 	this.onClearAllSourceLayers([sourceLayer], e)
					// }
				}
			}
		}

		isAdLibQueueableAndNonFloated = (piece: AdLibPieceUi) => {
			return (piece.isAction || piece.sourceLayer?.isQueueable) && !piece.invalid && !piece.floated
		}

		findShelfOnlySegment = (begin: number, end: number) => {
			const { uiSegments } = this.props
			for (let i = begin; begin > end ? i > end : i < end; begin > end ? i-- : i++) {
				const queueablePieces = uiSegments[i].pieces.filter(this.isAdLibQueueableAndNonFloated)
				if (uiSegments[i].isHidden && uiSegments[i].showShelf && queueablePieces.length) {
					return { segment: uiSegments[i], queueablePieces }
				}
			}
			return undefined
		}

		queueMinishelfAdLib = (e: any, forward: boolean) => {
			const { uiSegments, uiSegmentMap } = this.props
			const { keyboardQueuedPiece } = this.state
			let pieceToQueue: AdLibPieceUi | undefined
			let currentSegmentId: SegmentId | undefined
			if (keyboardQueuedPiece) {
				if (keyboardQueuedPiece.segmentId && uiSegmentMap.has(keyboardQueuedPiece.segmentId)) {
					const pieces = uiSegmentMap
						.get(keyboardQueuedPiece.segmentId)!
						.pieces.filter(this.isAdLibQueueableAndNonFloated)
					const nextPieceInd = pieces.findIndex((piece) => piece._id === keyboardQueuedPiece._id) + (forward ? 1 : -1)
					if (nextPieceInd >= 0 && nextPieceInd < pieces.length) {
						pieceToQueue = pieces[nextPieceInd]
					}
				}
				currentSegmentId = keyboardQueuedPiece.segmentId
			} else {
				currentSegmentId = this.props.currentPartInstance?.segmentId
			}
			if (!pieceToQueue) {
				if (currentSegmentId) {
					const currentSegmentInd = uiSegments.findIndex((segment) => segment._id === currentSegmentId)
					if (currentSegmentInd > 0) {
						let nextShelfOnlySegment = forward
							? this.findShelfOnlySegment(currentSegmentInd + 1, uiSegments.length) ||
							  this.findShelfOnlySegment(0, currentSegmentInd)
							: this.findShelfOnlySegment(currentSegmentInd - 1, -1) ||
							  this.findShelfOnlySegment(uiSegments.length - 1, currentSegmentInd)
						if (nextShelfOnlySegment && nextShelfOnlySegment.queueablePieces.length) {
							pieceToQueue =
								nextShelfOnlySegment.queueablePieces[forward ? 0 : nextShelfOnlySegment.queueablePieces.length - 1]
						}
					}
				}
			}
			if (pieceToQueue) {
				this.queueAdLibPiece(pieceToQueue, e)
				this.setState({ keyboardQueuedPiece: pieceToQueue })
			}
		}

		queueNextMinishelfAdLib = (e: any) => {
			this.queueMinishelfAdLib(e, true)
		}

		queuePrevMinishelfAdLib = (e: any) => {
			this.queueMinishelfAdLib(e, false)
		}

		onShelfChangeExpanded = (value: boolean) => {
			this.setState({
				isInspectorShelfExpanded: value,
				wasShelfResizedByUser: true,
			})
		}

		onTake = (e: any) => {
			const { t } = this.props
			if (this.state.studioMode && this.props.playlist) {
				const playlistId = this.props.playlist._id
				doUserAction(t, e, UserAction.TAKE, (e) => MeteorCall.userAction.take(e, playlistId))
			}
		}

		getStyle() {
			return {
				marginBottom: this.state.bottomMargin,
			}
		}

		render() {
			const { t } = this.props

			if (this.state.subsReady) {
				if (this.props.playlist && this.props.studio && this.props.showStyleBase && !this.props.onlyShelf) {
					const selectedPiece = this.state.selectedPiece
					const selectedPieceRundown: Rundown | undefined =
						(selectedPiece &&
							RundownUtils.isPieceInstance(selectedPiece) &&
							this.props.rundowns.find((r) => r._id === selectedPiece?.instance.rundownId)) ||
						undefined

					return (
						<RundownTimingProvider
							playlist={this.props.playlist}
							defaultDuration={Settings.defaultDisplayDuration}
							timeScale={this.state.timeScale}>
							<div
								className={ClassNames('rundown-view', {
									'notification-center-open': this.state.isNotificationsCenterOpen !== undefined,
									'rundown-view--studio-mode': this.state.studioMode,
								})}
								style={this.getStyle()}
								onWheelCapture={this.onWheel}
								onContextMenu={this.onContextMenuTop}>
								<ErrorBoundary>
									{this.state.studioMode && !Settings.disableBlurBorder && (
										<KeyboardFocusIndicator>
											<div className="rundown-view__focus-lost-frame"></div>
										</KeyboardFocusIndicator>
									)}
								</ErrorBoundary>
								<ErrorBoundary>
									<RundownRightHandControls
										isFollowingOnAir={this.state.followLiveSegments}
										onFollowOnAir={this.onGoToLiveSegment}
										onRewindSegments={this.onRewindSegments}
										isNotificationCenterOpen={this.state.isNotificationsCenterOpen}
										onToggleNotifications={this.onToggleNotifications}
										isSupportPanelOpen={this.state.isSupportPanelOpen}
										onToggleSupportPanel={this.onToggleSupportPanel}
										isStudioMode={this.state.studioMode}
										onTake={this.onTake}
										studioRouteSets={this.props.studio.routeSets}
										studioRouteSetExclusivityGroups={this.props.studio.routeSetExclusivityGroups}
										onStudioRouteSetSwitch={this.onStudioRouteSetSwitch}
									/>
								</ErrorBoundary>
								<ErrorBoundary>
									<VelocityReact.VelocityTransitionGroup
										enter={{
											animation: {
												translateX: ['0%', '100%'],
											},
											easing: 'ease-out',
											duration: 300,
										}}
										leave={{
											animation: {
												translateX: ['100%', '0%'],
											},
											easing: 'ease-in',
											duration: 500,
										}}>
										{this.state.isNotificationsCenterOpen && (
											<NotificationCenterPanel filter={this.state.isNotificationsCenterOpen} />
										)}
									</VelocityReact.VelocityTransitionGroup>
									<VelocityReact.VelocityTransitionGroup
										enter={{
											animation: {
												translateX: ['0%', '100%'],
											},
											easing: 'ease-out',
											duration: 300,
										}}
										leave={{
											animation: {
												translateX: ['100%', '0%'],
											},
											easing: 'ease-in',
											duration: 500,
										}}>
										{this.state.isSupportPanelOpen && (
											<SupportPopUp>
												<hr />
												<button className="btn btn-secondary" onClick={this.onToggleHotkeys}>
													{t('Show Hotkeys')}
												</button>
												<hr />
												<button className="btn btn-secondary" onClick={this.onTakeRundownSnapshot}>
													{t('Take a Snapshot')}
												</button>
												<hr />
												{this.state.studioMode && (
													<>
														<button className="btn btn-secondary" onClick={this.onRestartPlayout}>
															{t('Restart Playout')}
														</button>
														<hr />
													</>
												)}
												{this.state.studioMode &&
													this.props.casparCGPlayoutDevices &&
													this.props.casparCGPlayoutDevices.map((i) => (
														<React.Fragment key={unprotectString(i._id)}>
															<button className="btn btn-secondary" onClick={() => this.onRestartCasparCG(i)}>
																{t('Restart {{device}}', { device: i.name })}
															</button>
															<hr />
														</React.Fragment>
													))}
											</SupportPopUp>
										)}
									</VelocityReact.VelocityTransitionGroup>
								</ErrorBoundary>
								<ErrorBoundary>
									{this.state.studioMode && (
										<Prompt
											when={this.props.playlist.active || false}
											message={t('This rundown is now active. Are you sure you want to exit this screen?')}
										/>
									)}
								</ErrorBoundary>
								<ErrorBoundary>
									<RundownHeader
										playlist={this.props.playlist}
										studio={this.props.studio}
										rundownIds={this.props.rundowns.map((r) => r._id)}
										firstRundown={this.props.rundowns[0]}
										onActivate={this.onActivate}
										studioMode={this.state.studioMode}
										onRegisterHotkeys={this.onRegisterHotkeys}
										inActiveRundownView={this.props.inActiveRundownView}
										currentRundown={this.state.currentRundown || this.props.rundowns[0]}
										layout={this.state.rundownHeaderLayout}
									/>
								</ErrorBoundary>
								<ErrorBoundary>
									<NoraPreviewRenderer />
								</ErrorBoundary>
								<ErrorBoundary>
									<SegmentContextMenu
										contextMenuContext={this.state.contextMenuContext}
										playlist={this.props.playlist}
										onSetNext={this.onSetNext}
										onSetNextSegment={this.onSetNextSegment}
										onResyncSegment={this.onResyncSegment}
										studioMode={this.state.studioMode}
										enablePlayFromAnywhere={!!this.props.studio.settings.enablePlayFromAnywhere}
									/>
								</ErrorBoundary>
								<ErrorBoundary>
									{this.state.isClipTrimmerOpen &&
										this.state.selectedPiece &&
										RundownUtils.isPieceInstance(this.state.selectedPiece) &&
										this.props.studio &&
										this.props.playlist &&
										(selectedPieceRundown === undefined ? (
											<ModalDialog
												onAccept={() => this.setState({ selectedPiece: undefined })}
												title={t('Rundown not found')}
												acceptText={t('Close')}>
												{t('Rundown for piece "{{pieceLabel}}" could not be found.', {
													pieceLabel: this.state.selectedPiece.instance.piece.name,
												})}
											</ModalDialog>
										) : (
											<ClipTrimDialog
												studio={this.props.studio}
												playlistId={this.props.playlist._id}
												rundown={selectedPieceRundown}
												selectedPiece={this.state.selectedPiece.instance.piece}
												onClose={() => this.setState({ isClipTrimmerOpen: false })}
											/>
										))}
								</ErrorBoundary>
								{this.renderSegmentsList()}
								<ErrorBoundary>
									{this.props.matchedSegments && this.props.matchedSegments.length > 0 && (
										<AfterBroadcastForm playlist={this.props.playlist} />
									)}
								</ErrorBoundary>
								<ErrorBoundary>
									<PointerLockCursor />
								</ErrorBoundary>
								<ErrorBoundary>
									<Shelf
										buckets={this.props.buckets}
										isExpanded={
											this.state.isInspectorShelfExpanded ||
											(!this.state.wasShelfResizedByUser && this.state.shelfLayout?.openByDefault)
										}
										onChangeExpanded={this.onShelfChangeExpanded}
										hotkeys={this.state.usedHotkeys}
										playlist={this.props.playlist}
										showStyleBase={this.props.showStyleBase}
										studioMode={this.state.studioMode}
										onChangeBottomMargin={this.onChangeBottomMargin}
										onRegisterHotkeys={this.onRegisterHotkeys}
										rundownLayout={this.state.shelfLayout}
										shelfDisplayOptions={this.props.shelfDisplayOptions}
										bucketDisplayFilter={this.props.bucketDisplayFilter}
										studio={this.props.studio}
									/>
								</ErrorBoundary>
								<ErrorBoundary>
									{this.props.playlist && this.props.studio && this.props.showStyleBase && (
										<RundownNotifier
											playlistId={this.props.playlist._id}
											studio={this.props.studio}
											showStyleBase={this.props.showStyleBase}
										/>
									)}
								</ErrorBoundary>
							</div>
							{
								// USE IN CASE OF DEBUGGING EMERGENCY
								/* getDeveloperMode() && <div id='debug-console' className='debug-console' style={{
							background: 'rgba(255,255,255,0.7)',
							color: '#000',
							position: 'fixed',
							top: '0',
							right: '0',
							zIndex: 10000,
							pointerEvents: 'none'
						}}>
						</div> */
							}
						</RundownTimingProvider>
					)
				} else if (this.props.playlist && this.props.studio && this.props.showStyleBase && this.props.onlyShelf) {
					return (
						<RundownTimingProvider playlist={this.props.playlist} defaultDuration={Settings.defaultDisplayDuration}>
							<ErrorBoundary>
								<NoraPreviewRenderer />
							</ErrorBoundary>
							<ErrorBoundary>
								<div onContextMenu={this.onContextMenuTop}>
									<Shelf
										buckets={this.props.buckets}
										isExpanded={this.state.isInspectorShelfExpanded}
										onChangeExpanded={this.onShelfChangeExpanded}
										hotkeys={this.state.usedHotkeys}
										playlist={this.props.playlist}
										showStyleBase={this.props.showStyleBase}
										studioMode={this.state.studioMode}
										onChangeBottomMargin={this.onChangeBottomMargin}
										onRegisterHotkeys={this.onRegisterHotkeys}
										rundownLayout={this.state.shelfLayout}
										studio={this.props.studio}
										fullViewport={true}
										shelfDisplayOptions={this.props.shelfDisplayOptions}
										bucketDisplayFilter={this.props.bucketDisplayFilter}
										showBuckets={this.state.shelfLayout && this.state.shelfLayout.showBuckets}
									/>
								</div>
							</ErrorBoundary>
						</RundownTimingProvider>
					)
				} else {
					return (
						<div className="rundown-view rundown-view--unpublished">
							<div className="rundown-view__label">
								<p>
									{!this.props.playlist
										? t('This rundown has been unpublished from Sofie.')
										: !this.props.studio
										? t('Error: The studio of this Rundown was not found.')
										: !this.props.rundowns.length
										? t('This playlist is empty')
										: !this.props.showStyleBase
										? t('Error: The ShowStyle of this Rundown was not found.')
										: t('Unknown error')}
								</p>
								<p>
									<Route
										render={({ history }) => (
											<button
												className="btn btn-primary"
												onClick={() => {
													history.push('/rundowns')
												}}>
												{t('Return to list')}
											</button>
										)}
									/>
								</p>
							</div>
						</div>
					)
				}
			} else {
				return (
					<div className="rundown-view rundown-view--loading">
						<Spinner />
					</div>
				)
			}
		}
	}
)

export function handleRundownPlaylistReloadResponse(
	t: i18next.TFunction,
	result: ReloadRundownPlaylistResponse
): boolean {
	let possiblyBadResponse = _.first(result.rundownsResponses)

	result.rundownsResponses.forEach((r) => {
		if (r.response === TriggerReloadDataResponse.MISSING) {
			possiblyBadResponse = r
		}
	})
	// TODO: This is a hack, since it only handles the first error
	return possiblyBadResponse
		? handleRundownReloadResponse(t, possiblyBadResponse.rundownId, possiblyBadResponse.response)
		: false
}
export function handleRundownReloadResponse(
	t: i18next.TFunction,
	rundownId: RundownId,
	result: TriggerReloadDataResponse
): boolean {
	let hasDoneSomething = false

	if (result === TriggerReloadDataResponse.MISSING) {
		const rundown = Rundowns.findOne(rundownId)
		const playlist = RundownPlaylists.findOne(rundown?.playlistId)

		hasDoneSomething = true
		const notification = NotificationCenter.push(
			new Notification(
				undefined,
				NoticeLevel.CRITICAL,
				t(
					'Rundown {{rundownName}} in Playlist {{playlistName}} is missing in the data from {{nrcsName}}, what do you want to do?',
					{
						nrcsName: rundown?.externalNRCSName || 'NRCS',
						rundownName: rundown?.name || 'N/A',
						playlistName: playlist?.name || 'N/A',
					}
				),
				'userAction',
				undefined,
				true,
				[
					// actions:
					{
						label: t('Leave it in Sofie (mark the rundown as unsynced)'),
						type: 'default',
						disabled: !getAllowStudio(),
						action: () => {
							doUserAction(
								t,
								'Missing rundown action',
								UserAction.UNSYNC_RUNDOWN,
								(e) => MeteorCall.userAction.unsyncRundown(e, rundownId),
								(err) => {
									if (!err) {
										notification.stop()
									}
								}
							)
						},
					},
					{
						label: t('Remove just the rundown from Sofie'),
						type: 'default',
						action: () => {
							doModalDialog({
								title: t('Remove rundown'),
								message: t(
									'Do you really want to remove just the rundown "{{rundownName}}" in the playlist {{playlistName}} from Sofie? This cannot be undone!',
									{
										rundownName: rundown?.name || 'N/A',
										playlistName: playlist?.name || 'N/A',
									}
								),
								onAccept: () => {
									// nothing
									doUserAction(
										t,
										'Missing rundown action',
										UserAction.REMOVE_RUNDOWN,
										(e) => MeteorCall.userAction.removeRundown(e, rundownId),
										(err) => {
											if (!err) {
												notification.stop()
												window.location.assign(`/`)
											}
										}
									)
								},
							})
						},
					},
				]
			)
		)
	}
	return hasDoneSomething
}
