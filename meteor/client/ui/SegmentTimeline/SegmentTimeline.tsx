import * as React from 'react'
import * as PropTypes from 'prop-types'
import { withTranslation } from 'react-i18next'

import ClassNames from 'classnames'
import { ContextMenuTrigger } from '@jstarpl/react-contextmenu'

import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { Rundown, RundownHoldState } from '../../../lib/collections/Rundowns'
import { Studio } from '../../../lib/collections/Studios'
import { SegmentUi, PartUi, IOutputLayerUi, PieceUi } from './SegmentTimelineContainer'
import { TimelineGrid } from './TimelineGrid'
import { SegmentTimelinePart } from './SegmentTimelinePart'
import { SegmentTimelineZoomControls } from './SegmentTimelineZoomControls'
import { SegmentDuration, PartCountdown, RundownTiming, CurrentPartRemaining } from '../RundownView/RundownTiming'

import { RundownUtils } from '../../lib/rundown'
import { Translated } from '../../lib/ReactMeteorData/ReactMeteorData'
import { ErrorBoundary } from '../../lib/ErrorBoundary'
import { scrollToPart, lockPointer, unlockPointer } from '../../lib/viewPort'

// @ts-ignore Not recognized by Typescript
import * as Zoom_In_MouseOut from './Zoom_In_MouseOut.json'
// @ts-ignore Not recognized by Typescript
import * as Zoom_In_MouseOver from './Zoom_In_MouseOver.json'
// @ts-ignore Not recognized by Typescript
import * as Zoom_Normal_MouseOut from './Zoom_Normal_MouseOut.json'
// @ts-ignore Not recognized by Typescript
import * as Zoom_Normal_MouseOver from './Zoom_Normal_MouseOver.json'
// @ts-ignore Not recognized by Typescript
import * as Zoom_Out_MouseOut from './Zoom_Out_MouseOut.json'
// @ts-ignore Not recognized by Typescript
import * as Zoom_Out_MouseOver from './Zoom_Out_MouseOver.json'
import { LottieButton } from '../../lib/LottieButton'
import { PartNote, NoteType, SegmentNote } from '../../../lib/api/notes'
import { getAllowSpeaking } from '../../lib/localStorage'
import { showPointerLockCursor, hidePointerLockCursor } from '../../lib/PointerLockCursor'
import { Settings } from '../../../lib/Settings'
import { MAGIC_TIME_SCALE_FACTOR, RundownViewEvents, IContextMenuContext } from '../RundownView'
import { literal, protectString, unprotectString } from '../../../lib/lib'
import { SegmentId } from '../../../lib/collections/Segments'
import { PartId } from '../../../lib/collections/Parts'
import { contextMenuHoldToDisplayTime } from '../../lib/lib'
import { WarningIconSmall, CriticalIconSmall } from '../../lib/notificationIcons'
import { wrapPartToTemporaryInstance } from '../../../lib/collections/PartInstances'

interface IProps {
	id: string
	key: string
	segment: SegmentUi
	playlist: RundownPlaylist
	followLiveSegments: boolean
	studio: Studio
	parts: Array<PartUi>
	segmentNotes: Array<SegmentNote>
	timeScale: number
	onCollapseOutputToggle?: (layer: IOutputLayerUi, event: any) => void
	collapsedOutputs: {
		[key: string]: boolean
	}
	onCollapseSegmentToggle?: (event: any) => void
	isCollapsed?: boolean
	scrollLeft: number
	hasAlreadyPlayed: boolean
	hasGuestItems: boolean
	hasRemoteItems: boolean
	isLiveSegment: boolean
	isNextSegment: boolean
	isQueuedSegment: boolean
	followLiveLine: boolean
	liveLineHistorySize: number
	livePosition: number
	autoNextPart: boolean
	onScroll: (scrollLeft: number, event: any) => void
	onZoomChange: (newScale: number, event: any) => void
	onFollowLiveLine?: (state: boolean, event: any) => void
	onShowEntireSegment?: (event: any) => void
	onContextMenu?: (contextMenuContext: IContextMenuContext) => void
	onItemClick?: (piece: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	onItemDoubleClick?: (item: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	onHeaderNoteClick?: (level: NoteType) => void
	segmentRef?: (el: SegmentTimelineClass, segmentId: SegmentId) => void
	isLastSegment: boolean
	lastValidPartIndex: number | undefined
	budgetGap: number
	budgetDuration?: number
}
interface IStateHeader {
	timelineWidth: number
	mouseGrabbed: boolean
	highlight: boolean
}

interface IZoomPropsHeader {
	onZoomDblClick: (e) => void
	timelineWidth: number
}
interface IZoomStateHeader {
	totalSegmentDuration: number
}

const SegmentTimelineZoom = class SegmentTimelineZoom extends React.Component<
	IProps & IZoomPropsHeader,
	IZoomStateHeader
> {
	static contextTypes = {
		durations: PropTypes.object.isRequired,
	}

	constructor(props, context) {
		super(props, context)
		this.state = {
			totalSegmentDuration: 10,
		}
	}

	componentDidMount() {
		this.checkTimingChange()
		window.addEventListener(RundownTiming.Events.timeupdateHR, this.onTimeupdate)
	}

	componentWillUnmount() {
		window.removeEventListener(RundownTiming.Events.timeupdateHR, this.onTimeupdate)
	}

	onTimeupdate = () => {
		if (!this.props.isLiveSegment) {
			this.checkTimingChange()
		}
	}

	checkTimingChange = () => {
		const total = this.calculateSegmentDuration()
		if (total !== this.state.totalSegmentDuration) {
			this.setState({
				totalSegmentDuration: total,
			})
		}
	}

	calculateSegmentDuration(): number {
		let total = 0
		if (this.context && this.context.durations) {
			const durations = this.context.durations as RundownTiming.RundownTimingContext
			this.props.parts.forEach((item) => {
				// total += durations.partDurations ? durations.partDurations[item._id] : (item.duration || item.renderedDuration || 1)
				const duration = Math.max(
					item.instance.timings?.duration || item.renderedDuration || 0,
					(durations.partDisplayDurations && durations.partDisplayDurations[unprotectString(item.instance.part._id)]) ||
						Settings.defaultDisplayDuration
				)
				total += duration
			})
		} else {
			total = RundownUtils.getSegmentDuration(this.props.parts, true)
		}
		return total
	}

	getSegmentDuration(): number {
		return this.props.isLiveSegment ? this.calculateSegmentDuration() : this.state.totalSegmentDuration
	}

	renderZoomTimeline() {
		return this.props.parts.map((part, index, array) => {
			return (
				<SegmentTimelinePart
					key={unprotectString(part.partId)}
					segment={this.props.segment}
					playlist={this.props.playlist}
					studio={this.props.studio}
					collapsedOutputs={this.props.collapsedOutputs}
					isCollapsed={this.props.isCollapsed}
					scrollLeft={0}
					scrollWidth={1}
					timeScale={1}
					relative={true}
					totalSegmentDuration={this.getSegmentDuration()}
					part={part}
					followLiveLine={this.props.followLiveLine}
					autoNextPart={this.props.autoNextPart}
					liveLineHistorySize={this.props.liveLineHistorySize}
					livePosition={
						part.instance._id === this.props.playlist.currentPartInstanceId && part.instance.timings?.startedPlayback
							? this.props.livePosition - part.instance.timings.startedPlayback
							: null
					}
					isLastInSegment={false}
					isAfterLastValidInSegmentAndItsLive={false}
					isLastSegment={false}
					isBudgetGap={true}
				/>
			)
		})
	}

	renderMiniLiveLine() {
		if (this.props.isLiveSegment) {
			let lineStyle = {
				left: ((this.props.livePosition / this.getSegmentDuration()) * 100).toString() + '%',
			}

			return <div className="segment-timeline__zoom-area__liveline" style={lineStyle}></div>
		}
	}

	render() {
		return (
			<div className="segment-timeline__zoom-area-container">
				<div className="segment-timeline__zoom-area" onDoubleClick={(e) => this.props.onZoomDblClick(e)}>
					<div className="segment-timeline__timeline">{this.renderZoomTimeline()}</div>
					<SegmentTimelineZoomControls
						scrollLeft={this.props.scrollLeft}
						scrollWidth={this.props.timelineWidth / this.props.timeScale}
						onScroll={this.props.onScroll}
						segmentDuration={this.getSegmentDuration()}
						liveLineHistorySize={this.props.liveLineHistorySize}
						timeScale={this.props.timeScale}
						onZoomChange={this.props.onZoomChange}
					/>
					{this.renderMiniLiveLine()}
				</div>
			</div>
		)
	}
}

class SegmentTimelineZoomButtons extends React.Component<
	IProps & {
		onTimelineDoubleClick(e: React.MouseEvent<HTMLDivElement>)
	}
> {
	constructor(
		props: IProps & {
			onTimelineDoubleClick(e: React.MouseEvent<HTMLDivElement>)
		}
	) {
		super(props)
	}

	zoomIn = (e: React.MouseEvent<HTMLDivElement>) => {
		this.props.onZoomChange(this.props.timeScale * 2, e)
	}

	zoomOut = (e: React.MouseEvent<HTMLDivElement>) => {
		this.props.onZoomChange(this.props.timeScale * 0.5, e)
	}

	zoomNormalize = (e: React.MouseEvent<HTMLDivElement>) => {
		// this.props.onZoomChange(MAGIC_TIME_SCALE_FACTOR * Settings.defaultTimeScale, e)
		this.props.onTimelineDoubleClick && this.props.onTimelineDoubleClick(e)
	}

	render() {
		return (
			<div className="segment-timeline__timeline-zoom-buttons">
				<LottieButton
					className="segment-timeline__timeline-zoom-buttons__button"
					inAnimation={Zoom_In_MouseOut}
					outAnimation={Zoom_In_MouseOut}
					onClick={this.zoomIn}
				/>
				<LottieButton
					className="segment-timeline__timeline-zoom-buttons__button"
					inAnimation={Zoom_Normal_MouseOut}
					outAnimation={Zoom_Normal_MouseOut}
					onClick={this.zoomNormalize}
				/>
				<LottieButton
					className="segment-timeline__timeline-zoom-buttons__button"
					inAnimation={Zoom_Out_MouseOut}
					outAnimation={Zoom_Out_MouseOut}
					onClick={this.zoomOut}
				/>
			</div>
		)
	}
}

export const SEGMENT_TIMELINE_ELEMENT_ID = 'rundown__segment__'

export class SegmentTimelineClass extends React.Component<Translated<IProps>, IStateHeader> {
	static whyDidYouRender = true

	timeline: HTMLDivElement
	segmentBlock: HTMLDivElement

	private _touchSize: number = 0
	private _touchAttached: boolean = false
	private _mouseAttached: boolean = false
	private _lastClick: number = 0
	private _mouseMoved: boolean = false
	private _lastPointer:
		| {
				clientX: number
				clientY: number
		  }
		| undefined = undefined
	private static _zoomOutLatch: number | undefined = undefined
	private static _zoomOutLatchId: string | undefined = undefined

	constructor(props: Translated<IProps>) {
		super(props)
		this.state = {
			timelineWidth: 1,
			mouseGrabbed: false,
			highlight: false,
		}
	}

	componentDidMount() {
		super.componentDidMount && super.componentDidMount()
		window.addEventListener(RundownViewEvents.highlight, this.onHighlight)

		window.addEventListener(RundownViewEvents.segmentZoomOn, this.onRundownEventSegmentZoomOn)
		window.addEventListener(RundownViewEvents.segmentZoomOff, this.onRundownEventSegmentZoomOff)
	}

	componentWillUnmount() {
		super.componentWillUnmount && super.componentWillUnmount()
		window.removeEventListener(RundownViewEvents.highlight, this.onHighlight)
		clearTimeout(this.highlightTimeout)

		window.removeEventListener(RundownViewEvents.segmentZoomOn, this.onRundownEventSegmentZoomOn)
		window.removeEventListener(RundownViewEvents.segmentZoomOff, this.onRundownEventSegmentZoomOff)
	}

	private highlightTimeout: NodeJS.Timer

	private onHighlight = (e: any) => {
		if (e.detail && e.detail.segmentId === this.props.segment._id && !e.detail.partId && !e.detail.pieceId) {
			this.setState({
				highlight: true,
			})
			clearTimeout(this.highlightTimeout)
			this.highlightTimeout = setTimeout(() => {
				this.setState({
					highlight: false,
				})
			}, 5000)
		}
	}

	setSegmentRef = (el: HTMLDivElement) => {
		this.segmentBlock = el
		if (typeof this.props.segmentRef === 'function') this.props.segmentRef(this as any, this.props.segment._id)

		if (this.segmentBlock) {
			this.segmentBlock.addEventListener('wheel', this.onTimelineWheel, { passive: false, capture: true })
		}
	}

	setTimelineRef = (el: HTMLDivElement) => {
		this.timeline = el
	}

	onTimelineResize = (size: number[]) => {
		this.setState({
			timelineWidth: size[0],
		})
	}

	onZoomDblClick = (e) => {
		if (this.props.onShowEntireSegment) {
			this.props.onShowEntireSegment(e)
		}
	}

	onTimelineTouchEnd = (e: React.TouchEvent<HTMLDivElement> & any) => {
		if (e.touches.length === 0) {
			document.removeEventListener('touchmove', this.onTimelineTouchMove)
			document.removeEventListener('touchend', this.onTimelineTouchEnd)
			this._touchAttached = false
		}
	}

	onTimelineTouchMove = (e: React.TouchEvent<HTMLDivElement> & any) => {
		if (e.touches.length === 2) {
			let newSize = e.touches[1].clientX - e.touches[0].clientX
			let prop = newSize / this._touchSize
			this.props.onZoomChange(Math.min(500, this.props.timeScale * prop), e)
			this._touchSize = newSize
		} else if (e.touches.length === 1 && this._lastPointer) {
			let scrollAmount = this._lastPointer.clientX - e.touches[0].clientX
			this.props.onScroll(Math.max(0, this.props.scrollLeft + scrollAmount / this.props.timeScale), e)
			this._lastPointer = {
				clientX: e.touches[0].clientX,
				clientY: e.touches[0].clientY,
			}
		}
	}

	onTimelineTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
		if (e.touches.length === 2) {
			// expect two touch points
			if (!this._touchAttached) {
				document.addEventListener('touchmove', this.onTimelineTouchMove)
				document.addEventListener('touchend', this.onTimelineTouchEnd)
				this._touchAttached = true
			}
			this._touchSize = e.touches[1].clientX - e.touches[0].clientX
			e.preventDefault()
			e.stopPropagation()
		} else if (e.touches.length === 1) {
			if (!this._touchAttached) {
				document.addEventListener('touchmove', this.onTimelineTouchMove)
				document.addEventListener('touchend', this.onTimelineTouchEnd)
				this._touchAttached = true
			}
			this._lastPointer = {
				clientX: e.touches[0].clientX,
				clientY: e.touches[0].clientY,
			}
			e.preventDefault()
			e.stopPropagation()
		}
	}

	onTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!this._touchAttached && !this._mouseAttached) {
			// if mouse down is on a piece - abort
			if ((e.target as HTMLDivElement).classList.contains('segment-timeline__piece')) return
			// check that only primary button is pressed down (mask 00001b)
			if ((e.buttons & 1) !== 1) return
			e.preventDefault()

			document.addEventListener('mousemove', this.onTimelineMouseMove)
			document.addEventListener('mouseup', this.onTimelineMouseUp)
			this._mouseAttached = true
			this.setState({
				mouseGrabbed: true,
			})
			this._lastPointer = {
				clientX: e.clientX,
				clientY: e.clientY,
			}
			document.addEventListener('pointerlockchange', this.onTimelinePointerLockChange)
			document.addEventListener('pointerlockerror', this.onTimelinePointerError)
			lockPointer()
			showPointerLockCursor(this._lastPointer.clientX, this._lastPointer.clientY)
			this._mouseMoved = false
		}
	}

	onTimelineMouseMove = (e: React.MouseEvent<HTMLDivElement> & any) => {
		let scrollAmount = e.movementX * -1 || (this._lastPointer ? this._lastPointer.clientX - e.clientX : 0)
		this.props.onScroll(Math.max(0, this.props.scrollLeft + scrollAmount / this.props.timeScale), e)
		if (e.movementX === 0) {
			this._lastPointer = {
				clientX: e.clientX,
				clientY: e.clientY,
			}
		}
		if (e.movementX !== 0 || e.movementY !== 0) {
			this._mouseMoved = true
		}
	}

	onTimelineMouseUp = (e: React.MouseEvent<HTMLDivElement> & any) => {
		document.removeEventListener('mousemove', this.onTimelineMouseMove)
		document.removeEventListener('mouseup', this.onTimelineMouseUp)
		this._mouseAttached = false
		this._lastPointer = undefined
		this.setState({
			mouseGrabbed: false,
		})
		unlockPointer()
		hidePointerLockCursor()

		const now = Date.now()
		if (!this._mouseMoved && now - this._lastClick < 500) {
			this.onTimelineDoubleClick(e)
		}
		this._lastClick = this._mouseMoved ? 0 : now
	}

	onTimelinePointerLockChange = (e: Event) => {
		if (!document.pointerLockElement) {
			hidePointerLockCursor()
			document.removeEventListener('pointerlockchange', this.onTimelinePointerLockChange)
			document.removeEventListener('pointerlockerror', this.onTimelinePointerError)
		}
	}

	onTimelinePointerError = (e: Event) => {
		hidePointerLockCursor()
		document.removeEventListener('pointerlockchange', this.onTimelinePointerLockChange)
		document.removeEventListener('pointerlockerror', this.onTimelinePointerError)
	}

	onRundownEventSegmentZoomOn = (e: any) => {
		if (this.props.isLiveSegment || (this.props.isNextSegment && this.props.playlist.currentPartInstanceId === null)) {
			this.onTimelineZoomOn(e)
		}
	}

	onRundownEventSegmentZoomOff = (e: any) => {
		if (this.props.isLiveSegment || (this.props.isNextSegment && this.props.playlist.currentPartInstanceId === null)) {
			this.onTimelineZoomOff(e)
		}
	}

	onTimelineZoomOn = (e: any) => {
		if (SegmentTimelineClass._zoomOutLatch === undefined) {
			SegmentTimelineClass._zoomOutLatch = this.props.timeScale
		}
		SegmentTimelineClass._zoomOutLatchId = this.props.id
		if (this.props.onShowEntireSegment) this.props.onShowEntireSegment(e)
	}

	onTimelineZoomOff = (e: any) => {
		if (SegmentTimelineClass._zoomOutLatch !== undefined) {
			this.props.onZoomChange(SegmentTimelineClass._zoomOutLatch, e)
		}
		SegmentTimelineClass._zoomOutLatch = undefined
		SegmentTimelineClass._zoomOutLatchId = undefined
	}

	// doubleclick is simulated by onTimelineMouseUp, because we use pointer lock and that prevents dblclick events
	onTimelineDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (SegmentTimelineClass._zoomOutLatch === undefined || SegmentTimelineClass._zoomOutLatchId !== this.props.id) {
			this.onTimelineZoomOn(e)
		} else {
			this.onTimelineZoomOff(e)
		}
	}

	onTimelineWheel = (e: WheelEvent) => {
		if (
			e.ctrlKey &&
			!e.altKey &&
			!e.metaKey &&
			!e.shiftKey &&
			// @ts-ignore
			!window.keyboardModifiers.altRight
		) {
			// ctrl + Scroll
			this.props.onZoomChange(Math.min(500, this.props.timeScale * (1 + 0.001 * (e.deltaY * -1))), e)
			e.preventDefault()
			e.stopPropagation()
		} else if (
			(!e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey) ||
			// @ts-ignore
			(e.ctrlKey && !e.metaKey && !e.shiftKey && window.keyboardModifiers.altRight)
		) {
			// Alt + Scroll
			this.props.onScroll(Math.max(0, this.props.scrollLeft + e.deltaY / this.props.timeScale), e)
			e.preventDefault()
			e.stopPropagation()
		} else if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
			// no modifier
			if (e.deltaX !== 0) {
				this.props.onScroll(Math.max(0, this.props.scrollLeft + e.deltaX / this.props.timeScale), e)
				e.preventDefault()
			}
		}
	}

	onClickSegmentIdent = (partId: PartId) => {
		scrollToPart(partId, false, true).catch((error) => {
			if (!error.toString().match(/another scroll/)) console.error(error)
		})
	}

	getSegmentContext = (props) => {
		const ctx = literal<IContextMenuContext>({
			segment: this.props.segment,
			part: this.props.parts.length > 0 ? this.props.parts[0] : null,
		})

		if (this.props.onContextMenu && typeof this.props.onContextMenu === 'function') {
			this.props.onContextMenu(ctx)
		}

		return ctx
	}

	getSegmentDuration() {
		return (this.props.parts && RundownUtils.getSegmentDuration(this.props.parts)) || 0
	}

	timelineStyle() {
		return {
			transform:
				'translate3d(-' + Math.floor(this.props.scrollLeft * this.props.timeScale).toString() + 'px, 0, 0.1px)',
			willChange: 'transform',
		}
	}

	renderLiveLine() {
		const { t } = this.props

		if (this.props.isLiveSegment) {
			let pixelPostion = Math.floor(
				this.props.livePosition * this.props.timeScale -
					(!this.props.followLiveLine ? this.props.scrollLeft * this.props.timeScale : 0)
			)
			let lineStyle = {
				left:
					(this.props.followLiveLine
						? Math.min(pixelPostion, this.props.liveLineHistorySize).toString()
						: pixelPostion.toString()) + 'px',
			}

			return [
				<div
					className="segment-timeline__liveline-shade"
					key={this.props.segment._id + '-liveline-shade'}
					style={{
						width:
							(this.props.followLiveLine
								? Math.min(Math.max(0, pixelPostion), this.props.liveLineHistorySize).toString()
								: Math.max(0, pixelPostion).toString()) + 'px',
					}}
				/>,
				<div className="segment-timeline__liveline" key={this.props.segment._id + '-liveline'} style={lineStyle}>
					<div
						className="segment-timeline__liveline__label"
						onClick={(e) => this.props.onFollowLiveLine && this.props.onFollowLiveLine(true, e)}>
						{t('On Air')}
					</div>
					<div className="segment-timeline__liveline__timecode">
						<CurrentPartRemaining
							currentPartInstanceId={this.props.playlist.currentPartInstanceId}
							speaking={getAllowSpeaking()}
							heavyClassName="overtime"
						/>
						{this.props.autoNextPart ? (
							<div className="rundown-view__part__icon rundown-view__part__icon--auto-next"></div>
						) : (
							<div className="rundown-view__part__icon rundown-view__part__icon--next"></div>
						)}
						{this.props.playlist.holdState && this.props.playlist.holdState !== RundownHoldState.COMPLETE ? (
							<div className="segment-timeline__liveline__status segment-timeline__liveline__status--hold">
								{t('Hold')}
							</div>
						) : null}
					</div>
				</div>,
			]
		}
	}

	renderTimeline() {
		let partIsLive = false
		return (
			<React.Fragment>
				{this.props.parts.map((part, index) => {
					let previousPartIsLive = partIsLive
					partIsLive = part.instance._id === this.props.playlist.currentPartInstanceId
					return (
						<SegmentTimelinePart
							key={unprotectString(part.partId)}
							segment={this.props.segment}
							playlist={this.props.playlist}
							studio={this.props.studio}
							collapsedOutputs={this.props.collapsedOutputs}
							isCollapsed={this.props.isCollapsed}
							scrollLeft={this.props.scrollLeft}
							timeScale={this.props.timeScale}
							autoNextPart={this.props.autoNextPart}
							followLiveLine={this.props.followLiveLine}
							liveLineHistorySize={this.props.liveLineHistorySize}
							livePosition={this.props.livePosition}
							onScroll={this.props.onScroll}
							onCollapseOutputToggle={this.props.onCollapseOutputToggle}
							onCollapseSegmentToggle={this.props.onCollapseSegmentToggle}
							onFollowLiveLine={this.props.onFollowLiveLine}
							onContextMenu={this.props.onContextMenu}
							relative={false}
							onPieceClick={this.props.onItemClick}
							onPieceDoubleClick={this.props.onItemDoubleClick}
							scrollWidth={this.state.timelineWidth / this.props.timeScale}
							firstPartInSegment={this.props.parts[0]}
							lastPartInSegment={this.props.parts[this.props.parts.length - 1]}
							isLastSegment={this.props.isLastSegment}
							isLastInSegment={index === this.props.parts.length - 1 && this.props.budgetGap <= 0}
							isAfterLastValidInSegmentAndItsLive={
								index === (this.props.lastValidPartIndex || 0) + 1 &&
								previousPartIsLive &&
								!!this.props.playlist.nextPartInstanceId
							}
							part={part}
							isBudgetGap={false}
						/>
					)
				})}
				{this.props.budgetGap > 0 && (
					<SegmentTimelinePart
						key={'gap'}
						segment={this.props.segment}
						playlist={this.props.playlist}
						studio={this.props.studio}
						collapsedOutputs={this.props.collapsedOutputs}
						isCollapsed={this.props.isCollapsed}
						scrollLeft={this.props.scrollLeft}
						timeScale={this.props.timeScale}
						autoNextPart={this.props.autoNextPart}
						followLiveLine={this.props.followLiveLine}
						liveLineHistorySize={this.props.liveLineHistorySize}
						livePosition={this.props.livePosition}
						onScroll={this.props.onScroll}
						onCollapseOutputToggle={this.props.onCollapseOutputToggle}
						onCollapseSegmentToggle={this.props.onCollapseSegmentToggle}
						onFollowLiveLine={this.props.onFollowLiveLine}
						onContextMenu={this.props.onContextMenu}
						relative={false}
						onPieceClick={this.props.onItemClick}
						onPieceDoubleClick={this.props.onItemDoubleClick}
						scrollWidth={this.state.timelineWidth / this.props.timeScale}
						firstPartInSegment={this.props.parts[0]}
						lastPartInSegment={this.props.parts[this.props.parts.length - 1]}
						isLastSegment={this.props.isLastSegment}
						isLastInSegment={true}
						isAfterLastValidInSegmentAndItsLive={
							this.props.parts.length === (this.props.lastValidPartIndex || 0) + 1 &&
							partIsLive &&
							!!this.props.playlist.nextPartInstanceId
						}
						isBudgetGap={true}
						part={{
							partId: protectString('gap'),
							instance: wrapPartToTemporaryInstance({
								_id: protectString('gap'),
								_rank: 0,
								segmentId: this.props.segment._id,
								rundownId: this.props.segment.rundownId,
								externalId: 'gap',
								gap: true,
								title: 'gap',
								invalid: true,
							}),
							pieces: [],
							renderedDuration: this.props.budgetGap,
							startsAt: 0,
							willProbablyAutoNext: false,
						}}
					/>
				)}
			</React.Fragment>
		)
	}

	renderEndOfSegment() {
		return <div className="segment-timeline__part segment-timeline__part--end-of-segment"></div>
	}

	renderOutputLayerControls() {
		if (this.props.segment.outputLayers !== undefined) {
			return Object.values(this.props.segment.outputLayers)
				.sort((a, b) => {
					return a._rank - b._rank
				})
				.map((outputLayer) => {
					if (outputLayer.used) {
						const isCollapsable =
							outputLayer.sourceLayers !== undefined && outputLayer.sourceLayers.length > 1 && !outputLayer.isFlattened
						return (
							<div
								key={outputLayer._id}
								className={ClassNames('segment-timeline__output-layer-control', {
									collapsable: isCollapsable,
									collapsed:
										this.props.collapsedOutputs[outputLayer._id] !== undefined
											? this.props.collapsedOutputs[outputLayer._id] === true
											: outputLayer.isDefaultCollapsed,
								})}>
								<div
									className="segment-timeline__output-layer-control__label"
									data-output-id={outputLayer._id}
									tabIndex={0}
									onClick={(e) =>
										isCollapsable &&
										this.props.onCollapseOutputToggle &&
										this.props.onCollapseOutputToggle(outputLayer, e)
									}>
									{outputLayer.name}
								</div>
								{outputLayer.sourceLayers !== undefined &&
									(!outputLayer.isFlattened ? (
										outputLayer.sourceLayers
											.filter((i) => !i.isHidden)
											.sort((a, b) => a._rank - b._rank)
											.map((sourceLayer, index, array) => {
												return (
													<div
														key={sourceLayer._id}
														className="segment-timeline__output-layer-control__layer"
														data-source-id={sourceLayer._id}>
														{array.length === 1 || sourceLayer.name === outputLayer.name ? '\xa0' : sourceLayer.name}
													</div>
												)
											})
									) : (
										<div
											key={outputLayer._id + '_flattened'}
											className="segment-timeline__output-layer-control__layer"
											data-source-id={outputLayer.sourceLayers.map((i) => i._id).join(',')}>
											&nbsp;
										</div>
									))}
							</div>
						)
					}
				})
		}
	}

	renderEditorialLine() {
		if (this.props.budgetDuration !== undefined) {
			let lineStyle = {
				left: this.props.budgetDuration * this.props.timeScale - this.props.scrollLeft * this.props.timeScale + 'px',
			}
			return <div className="segment-timeline__editorialline" style={lineStyle}></div>
		}
	}

	render() {
		let notes: Array<SegmentNote> = this.props.segmentNotes

		const { t } = this.props

		const criticalNotes = notes.reduce((prev, item) => {
			if (item.type === NoteType.ERROR) return ++prev
			return prev
		}, 0)
		const warningNotes = notes.reduce((prev, item) => {
			if (item.type === NoteType.WARNING) return ++prev
			return prev
		}, 0)

		const identifiers: Array<{ partId: PartId; ident?: string }> = this.props.parts
			.map((p) =>
				p.instance.part.identifier
					? {
							partId: p.partId,
							ident: p.instance.part.identifier,
					  }
					: null
			)
			.filter((entry) => entry !== null) as Array<{ partId: PartId; ident?: string }>

		let countdownToPartId: PartId | undefined = undefined
		if (!this.props.isLiveSegment) {
			const nextPart = this.props.isNextSegment
				? this.props.parts.find((p) => p.instance._id === this.props.playlist.nextPartInstanceId)
				: this.props.parts[0]

			if (nextPart) {
				countdownToPartId = nextPart.instance.part._id
			}
		}

		return (
			<div
				id={this.props.id}
				className={ClassNames('segment-timeline', {
					collapsed: this.props.isCollapsed,

					live: this.props.isLiveSegment,
					next: !this.props.isLiveSegment && this.props.isNextSegment,
					queued: this.props.isQueuedSegment,

					'has-played':
						this.props.hasAlreadyPlayed &&
						!this.props.isLiveSegment &&
						!this.props.isNextSegment &&
						!this.props.hasGuestItems &&
						!this.props.hasRemoteItems,

					'has-guest-items': this.props.hasGuestItems,
					'has-remote-items': this.props.hasRemoteItems,
					'has-identifiers': identifiers.length > 0,
					'invert-flash': this.state.highlight,
				})}
				data-obj-id={this.props.segment._id}
				ref={this.setSegmentRef}>
				<ContextMenuTrigger
					id="segment-timeline-context-menu"
					collect={this.getSegmentContext}
					attributes={{
						className: 'segment-timeline__title',
					}}
					holdToDisplay={contextMenuHoldToDisplayTime()}
					renderTag="div">
					<h2
						className={'segment-timeline__title__label' + (this.props.segment.identifier ? ' identifier' : '')}
						data-identifier={this.props.segment.identifier}>
						{this.props.segment.name}
					</h2>
					{(criticalNotes > 0 || warningNotes > 0) && (
						<div className="segment-timeline__title__notes">
							{criticalNotes > 0 && (
								<div
									className="segment-timeline__title__notes__note segment-timeline__title__notes__note--critical"
									onClick={(e) => this.props.onHeaderNoteClick && this.props.onHeaderNoteClick(NoteType.ERROR)}>
									<CriticalIconSmall />
									<div className="segment-timeline__title__notes__count">{criticalNotes}</div>
								</div>
							)}
							{warningNotes > 0 && (
								<div
									className="segment-timeline__title__notes__note segment-timeline__title__notes__note--warning"
									onClick={(e) => this.props.onHeaderNoteClick && this.props.onHeaderNoteClick(NoteType.WARNING)}>
									<WarningIconSmall />
									<div className="segment-timeline__title__notes__count">{warningNotes}</div>
								</div>
							)}
						</div>
					)}
					{identifiers.length > 0 && (
						<div className="segment-timeline__part-identifiers">
							{identifiers.map((ident) => (
								<div
									className="segment-timeline__part-identifiers__identifier"
									key={ident.partId + ''}
									onClick={() => this.onClickSegmentIdent(ident.partId)}>
									{ident.ident}
								</div>
							))}
						</div>
					)}
				</ContextMenuTrigger>
				<div
					className="segment-timeline__duration"
					tabIndex={0}
					onClick={(e) => this.props.onCollapseSegmentToggle && this.props.onCollapseSegmentToggle(e)}>
					{this.props.playlist &&
						this.props.parts &&
						this.props.parts.length > 0 &&
						(!this.props.hasAlreadyPlayed || this.props.isNextSegment || this.props.isLiveSegment) && (
							<SegmentDuration
								partIds={this.props.parts
									.filter((item) => item.instance.timings?.duration === undefined)
									.map((item) => item.instance.part._id)}
								budgetDuration={this.props.budgetDuration}
								livePosition={this.props.isLiveSegment ? this.props.livePosition : 0}
							/>
						)}
				</div>
				<div className="segment-timeline__identifier">{this.props.segment.identifier}</div>
				<div
					className="segment-timeline__timeUntil"
					onClick={(e) => this.props.onCollapseSegmentToggle && this.props.onCollapseSegmentToggle(e)}>
					{this.props.playlist && this.props.parts && this.props.parts.length > 0 && (
						<PartCountdown partId={countdownToPartId} hideOnZero={true} />
					)}
					{Settings.allowUnsyncedSegments && this.props.segment.unsynced && (
						<span className="segment-timeline__unsynced">{t('Unsynced')}</span>
					)}
				</div>
				<div className="segment-timeline__mos-id">{this.props.segment.externalId}</div>
				<div className="segment-timeline__output-layers">{this.renderOutputLayerControls()}</div>
				<div className="segment-timeline__timeline-background" />
				<TimelineGrid {...this.props} onResize={this.onTimelineResize} />
				<div
					className={ClassNames('segment-timeline__timeline-container', {
						'segment-timeline__timeline-container--grabbable': Settings.allowGrabbingTimeline,
						'segment-timeline__timeline-container--grabbed': this.state.mouseGrabbed,
					})}
					onMouseDownCapture={this.onTimelineMouseDown}
					onTouchStartCapture={this.onTimelineTouchStart}>
					<div
						className="segment-timeline__timeline"
						key={this.props.segment._id + '-timeline'}
						ref={this.setTimelineRef}
						style={this.timelineStyle()}>
						<ErrorBoundary>
							{this.renderTimeline()}
							{this.renderEndOfSegment()}
						</ErrorBoundary>
					</div>
					{this.renderEditorialLine()}
					{this.renderLiveLine()}
				</div>
				<ErrorBoundary>
					<SegmentTimelineZoomButtons {...this.props} onTimelineDoubleClick={this.onTimelineDoubleClick} />
				</ErrorBoundary>
				{/* <ErrorBoundary>
					<SegmentNextPreview
						rundown={this.props.rundown}
						collapsedOutputs={this.props.collapsedOutputs}
						isCollapsed={this.props.isCollapsed}
						outputGroups={this.props.segment.outputLayers}
						sourceLayers={this.props.segment.sourceLayers}
						part={this.props.followingPart} />
				</ErrorBoundary> */}
				<ErrorBoundary>
					<SegmentTimelineZoom
						onZoomDblClick={this.onZoomDblClick}
						timelineWidth={this.state.timelineWidth}
						{...this.props}
					/>
				</ErrorBoundary>
			</div>
		)
	}
}

export const SegmentTimeline = withTranslation()(SegmentTimelineClass)
