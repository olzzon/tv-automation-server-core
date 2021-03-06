import * as React from 'react'
import * as _ from 'underscore'
import ClassNames from 'classnames'
import { Meteor } from 'meteor/meteor'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { RundownAPI } from '../../../lib/api/rundown'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { RundownUtils } from '../../lib/rundown'
import {
	ISourceLayer,
	IOutputLayer,
	SourceLayerType,
	VTContent,
	LiveSpeakContent,
	GraphicsContent,
	SplitsContent,
	NoraContent,
} from '@sofie-automation/blueprints-integration'
import { MediaObject } from '../../../lib/collections/MediaObjects'
import { checkPieceContentStatus } from '../../../lib/mediaObjects'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { PubSub } from '../../../lib/api/pubsub'
import { IAdLibListItem } from './AdLibListItem'
import SplitInputIcon from '../PieceIcons/Renderers/SplitInput'
import { PieceDisplayStyle } from '../../../lib/collections/RundownLayouts'
import { DashboardPieceButtonSplitPreview } from './DashboardPieceButtonSplitPreview'
import { StyledTimecode } from '../../lib/StyledTimecode'
import { VTFloatingInspector } from '../FloatingInspectors/VTFloatingInspector'
import { getNoticeLevelForPieceStatus } from '../../lib/notifications/notifications'
import { L3rdFloatingInspector } from '../FloatingInspectors/L3rdFloatingInspector'
import { protectString } from '../../../lib/lib'
import { Studio } from '../../../lib/collections/Studios'
import { withMediaObjectStatus } from '../SegmentTimeline/withMediaObjectStatus'
import { ensureHasTrailingSlash } from '../../lib/lib'
import { isTouchDevice } from '../../lib/lib'
import { AdLibPieceUi } from '../../lib/shelf'

export interface IDashboardButtonProps {
	piece: IAdLibListItem
	studio: Studio
	layer?: ISourceLayer
	outputLayer?: IOutputLayer
	onToggleAdLib: (aSLine: IAdLibListItem, queue: boolean, e: any) => void
	playlist: RundownPlaylist
	mediaPreviewUrl?: string
	isOnAir?: boolean
	isNext?: boolean
	widthScale?: number
	heightScale?: number
	disabled?: boolean
	displayStyle: PieceDisplayStyle
	isSelected?: boolean
	queueAllAdlibs?: boolean
	showThumbnailsInList?: boolean
	editableName?: boolean
	onNameChanged?: (e: any, value: string) => void
	canOverflowHorizontally?: boolean
	lineBreak?: string
}
export const DEFAULT_BUTTON_WIDTH = 6.40625
export const DEFAULT_BUTTON_HEIGHT = 5.625

interface IState {
	label: string
	isHovered: boolean
	timePosition: number
}

export class DashboardPieceButtonBase<T = {}> extends MeteorReactComponent<
	Translated<IDashboardButtonProps> & T,
	IState
> {
	private objId: string
	private element: HTMLDivElement | null = null
	private positionAndSize: {
		top: number
		left: number
		width: number
		height: number
	} | null = null
	private _labelEl: HTMLTextAreaElement

	constructor(props: IDashboardButtonProps) {
		super(props)

		this.state = {
			isHovered: false,
			timePosition: 0,
			label: this.props.piece.name,
		}
	}

	componentDidUpdate(prevProps) {
		if (prevProps.piece.name !== this.props.piece.name) {
			this.setState({
				label: this.props.piece.name,
			})
		}
	}

	getThumbnailUrl = (): string | undefined => {
		const { piece } = this.props
		const { mediaPreviewsUrl } = this.props.studio.settings

		if (piece && piece.contentMetaData && piece.contentMetaData.previewPath && mediaPreviewsUrl) {
			return (
				ensureHasTrailingSlash(mediaPreviewsUrl) +
				'media/thumbnail/' +
				piece.contentMetaData.mediaId
					.split('/')
					.map((id) => encodeURIComponent(id))
					.join('/')
			)
		}
		return undefined
	}

	renderGraphics(renderThumbnail?: boolean) {
		const adLib = (this.props.piece as any) as AdLibPieceUi
		const noraContent = adLib.content as NoraContent | undefined

		const thumbnailUrl = this.getThumbnailUrl()
		return (
			<>
				{thumbnailUrl && renderThumbnail && (
					<div className="dashboard-panel__panel__button__thumbnail">
						<img src={thumbnailUrl} />
					</div>
				)}
			</>
		)
	}

	renderVTLiveSpeak(renderThumbnail?: boolean) {
		let thumbnailUrl: string | undefined
		let sourceDuration: number | undefined
		const adLib = (this.props.piece as any) as AdLibPieceUi
		if (this.props.piece.content) {
			thumbnailUrl = this.getThumbnailUrl()
			const vtContent = adLib.content as VTContent | undefined
			sourceDuration = vtContent?.sourceDuration
		}
		return (
			<>
				{sourceDuration && (
					<span className="dashboard-panel__panel__button__sub-label">
						{sourceDuration ? <StyledTimecode time={sourceDuration || 0} /> : null}
					</span>
				)}
				<VTFloatingInspector
					showMiniInspector={this.state.isHovered}
					timePosition={this.state.timePosition}
					content={adLib.content as VTContent | undefined}
					floatingInspectorStyle={{
						top: this.positionAndSize?.top + 'px',
						left: this.positionAndSize?.left + 'px',
						transform: 'translate(0, -100%)',
					}}
					typeClass={this.props.layer && RundownUtils.getSourceLayerClassName(this.props.layer.type)}
					itemElement={null}
					contentMetaData={this.props.piece.contentMetaData || null}
					noticeMessage={this.props.piece.message || null}
					noticeLevel={
						this.props.piece.status !== null && this.props.piece.status !== undefined
							? getNoticeLevelForPieceStatus(this.props.piece.status)
							: null
					}
					mediaPreviewUrl={this.props.mediaPreviewUrl}
				/>
				{thumbnailUrl && renderThumbnail && (
					<div className="dashboard-panel__panel__button__thumbnail">
						<img src={thumbnailUrl} />
					</div>
				)}
			</>
		)
	}

	renderSplits(renderThumbnail: boolean = false) {
		const splitAdLib = this.props.piece
		if (splitAdLib && splitAdLib.content) {
			return (
				<>
					{renderThumbnail ? (
						<DashboardPieceButtonSplitPreview piece={splitAdLib} />
					) : (
						<SplitInputIcon
							abbreviation={this.props.layer ? this.props.layer.abbreviation : undefined}
							piece={splitAdLib}
							hideLabel={true}
						/>
					)}
				</>
			)
		}
	}

	private setRef = (el: HTMLDivElement | null) => {
		this.element = el
	}

	private handleOnMouseEnter = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
		if (this.element) {
			const { top, left, width, height } = this.element.getBoundingClientRect()
			this.positionAndSize = {
				top,
				left,
				width,
				height,
			}
		}
		this.setState({ isHovered: true })
	}

	private handleOnMouseLeave = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
		this.setState({ isHovered: false })
		this.positionAndSize = null
	}

	private handleOnMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		this.handleMove(e.clientX)
	}

	private handleOnTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
		if (e.changedTouches && e.changedTouches.length) {
			this.handleMove(e.changedTouches[0].clientX)
		}
	}

	private handleMove = (clientX: number) => {
		const timePercentage = Math.max(
			0,
			Math.min((clientX - (this.positionAndSize?.left || 0) - 5) / ((this.positionAndSize?.width || 1) - 10), 1)
		)
		const sourceDuration = (this.props.piece.content as VTContent | undefined)?.sourceDuration || 0
		this.setState({
			timePosition: timePercentage * sourceDuration,
		})
	}

	private handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
		this.props.onToggleAdLib(this.props.piece, e.shiftKey || !!this.props.queueAllAdlibs, e)
		if (isTouchDevice()) {
			// hide the hoverscrub
			this.handleOnMouseLeave(e)
		}
	}

	private onNameChanged = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		this.setState({
			label: e.currentTarget.value || '',
		})
	}

	private onRenameTextBoxKeyUp = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			this.setState(
				{
					label: this.props.piece.name,
				},
				() => {
					this._labelEl && this._labelEl.blur()
				}
			)
			e.preventDefault()
			e.stopPropagation()
			e.stopImmediatePropagation()
		} else if (e.key === 'Enter') {
			this._labelEl && this._labelEl.blur()
			e.preventDefault()
			e.stopPropagation()
			e.stopImmediatePropagation()
		}
	}

	private onRenameTextBoxBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
		if (!this.state.label.trim()) {
			e.persist()
			this.setState(
				{
					label: this.props.piece.name,
				},
				() => {
					this.props.onNameChanged && this.props.onNameChanged(e, this.state.label)
				}
			)
		} else {
			this.props.onNameChanged && this.props.onNameChanged(e, this.state.label)
		}
	}

	private renameTextBoxFocus = (input: HTMLTextAreaElement) => {
		input.focus()
		input.setSelectionRange(0, input.value.length)
	}

	private onRenameTextBoxShow = (ref: HTMLTextAreaElement) => {
		if (ref && !this._labelEl) {
			ref.addEventListener('keyup', this.onRenameTextBoxKeyUp)
			this.renameTextBoxFocus(ref)
		}
		this._labelEl = ref
	}

	renderGraphic(renderThumbnail?: boolean) {
		if (this.props.mediaPreviewUrl) {
			const previewUrl = this.getThumbnailUrl()
			return (
				<React.Fragment>
					{previewUrl && renderThumbnail && (
						<img src={previewUrl} className="dashboard-panel__panel__button__thumbnail" />
					)}
				</React.Fragment>
			)
		}
	}

	renderHotkey() {
		if (this.props.piece.hotkey) {
			return <div className="dashboard-panel__panel__button__hotkey">{this.props.piece.hotkey.toUpperCase()}</div>
		}
	}

	render() {
		const isList = this.props.displayStyle === PieceDisplayStyle.LIST
		const isButtons = this.props.displayStyle === PieceDisplayStyle.BUTTONS
		return (
			<div
				className={ClassNames(
					'dashboard-panel__panel__button',
					{
						invalid: this.props.piece.invalid,
						floated: this.props.piece.floated,

						'source-missing': this.props.piece.status === RundownAPI.PieceStatusCode.SOURCE_MISSING,
						'source-broken': this.props.piece.status === RundownAPI.PieceStatusCode.SOURCE_BROKEN,
						'unknown-state': this.props.piece.status === RundownAPI.PieceStatusCode.UNKNOWN,

						live: this.props.isOnAir,
						disabled: this.props.disabled,
						list: isList,
						selected: this.props.isNext || this.props.isSelected,
					},
					this.props.layer && RundownUtils.getSourceLayerClassName(this.props.layer.type),
					...(this.props.piece.tags ? this.props.piece.tags.map((tag) => `piece-tag--${tag}`) : [])
				)}
				style={{
					width: isList
						? 'calc(100% - 8px)'
						: !!this.props.widthScale
						? //@ts-ignore: widthScale is in a weird state between a number and something else
						  //		      because of the optional generic type argument
						  (this.props.widthScale as number) * DEFAULT_BUTTON_WIDTH + 'em'
						: undefined,
					height:
						!isList && !!this.props.heightScale
							? //@ts-ignore
							  (this.props.heightScale as number) * DEFAULT_BUTTON_HEIGHT + 'em'
							: undefined,
				}}
				onClick={this.handleClick}
				ref={this.setRef}
				onMouseEnter={this.handleOnMouseEnter}
				onMouseLeave={this.handleOnMouseLeave}
				onMouseMove={this.handleOnMouseMove}
				onTouchStart={!this.props.canOverflowHorizontally ? this.handleOnMouseEnter : undefined}
				onTouchEnd={!this.props.canOverflowHorizontally ? this.handleOnMouseLeave : undefined}
				onTouchMove={!this.props.canOverflowHorizontally ? this.handleOnTouchMove : undefined}
				data-obj-id={this.props.piece._id}>
				<div className="dashboard-panel__panel__button__content">
					{!this.props.layer
						? null
						: this.props.layer.type === SourceLayerType.VT ||
						  this.props.layer.type === SourceLayerType.LIVE_SPEAK ||
						  this.props.layer.type === SourceLayerType.TRANSITION
						? // VT should have thumbnails in "Button" layout.
						  this.renderVTLiveSpeak(isButtons || (isList && this.props.showThumbnailsInList))
						: this.props.layer.type === SourceLayerType.SPLITS
						? this.renderSplits(isList && this.props.showThumbnailsInList)
						: this.props.layer.type === SourceLayerType.GRAPHICS ||
						  this.props.layer.type === SourceLayerType.LOWER_THIRD
						? this.renderGraphics(isButtons || (isList && this.props.showThumbnailsInList))
						: null}
					{this.renderHotkey()}
					<div className="dashboard-panel__panel__button__label-container">
						{this.props.editableName ? (
							<textarea
								className="dashboard-panel__panel__button__label dashboard-panel__panel__button__label--editable"
								value={this.state.label}
								onChange={this.onNameChanged}
								onBlur={this.onRenameTextBoxBlur}
								ref={this.onRenameTextBoxShow}></textarea>
						) : (
							<span className="dashboard-panel__panel__button__label">
								{this.props.lineBreak && this.state.label.includes(this.props.lineBreak!)
									? this.state.label.split(this.props.lineBreak!).map((line, index) => {
											return (
												<span key={index}>
													{line}
													<br />
												</span>
											)
									  })
									: this.state.label}
							</span>
						)}
					</div>
				</div>
			</div>
		)
	}
}

export const DashboardPieceButton = withMediaObjectStatus<IDashboardButtonProps, {}>()(DashboardPieceButtonBase)
