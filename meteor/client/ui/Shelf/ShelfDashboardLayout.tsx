import * as React from 'react'
import { DashboardLayout, DashboardLayoutFilter, RundownLayouts } from '../../../lib/collections/RundownLayouts'
import { RundownLayoutsAPI } from '../../../lib/api/rundownLayouts'
import { TimelineDashboardPanel } from './TimelineDashboardPanel'
import { DashboardPanel } from './DashboardPanel'
import { ExternalFramePanel } from './ExternalFramePanel'
import { DashboardActionButtonGroup } from './DashboardActionButtonGroup'
import { ShowStyleBase } from '../../../lib/collections/ShowStyleBases'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { Rundown } from '../../../lib/collections/Rundowns'
import { Bucket } from '../../../lib/collections/Buckets'
import { unprotectString } from '../../../lib/lib'
import { AdLibRegionPanel } from './AdLibRegionPanel'
import { KeyboardPreviewPanel } from './KeyboardPreviewPanel'
import { Studio } from '../../../lib/collections/Studios'
import { PieceCountdownPanel } from './PieceCountdownPanel'
import { NextInfoPanel } from './NextInfoPanel'

export interface IShelfDashboardLayoutProps {
	rundownLayout: DashboardLayout
	playlist: RundownPlaylist
	buckets: Bucket[] | undefined
	showStyleBase: ShowStyleBase
	studioMode: boolean
	shouldQueue: boolean
	studio: Studio
	onChangeQueueAdLib: (isQueue: boolean, e: any) => void
}

export function ShelfDashboardLayout(props: IShelfDashboardLayoutProps) {
	const { rundownLayout, buckets } = props
	return (
		<div className="dashboard">
			{rundownLayout.filters
				.sort((a, b) => a.rank - b.rank)
				.map((panel) =>
					RundownLayoutsAPI.isFilter(panel) ? (
						(panel as DashboardLayoutFilter).showAsTimeline ? (
							<TimelineDashboardPanel
								key={panel._id}
								includeGlobalAdLibs={true}
								filter={panel}
								visible={!(panel as DashboardLayoutFilter).hide}
								registerHotkeys={(panel as DashboardLayoutFilter).assignHotKeys}
								hotkeyGroup={panel.name.replace(/\W/, '_')}
								playlist={props.playlist}
								showStyleBase={props.showStyleBase}
								studioMode={props.studioMode}
								shouldQueue={props.shouldQueue}
								studio={props.studio}
								selectedPiece={undefined}
							/>
						) : (
							<DashboardPanel
								key={panel._id}
								includeGlobalAdLibs={true}
								filter={panel}
								visible={!(panel as DashboardLayoutFilter).hide}
								registerHotkeys={(panel as DashboardLayoutFilter).assignHotKeys}
								hotkeyGroup={panel.name.replace(/\W/, '_')}
								playlist={props.playlist}
								showStyleBase={props.showStyleBase}
								studioMode={props.studioMode}
								shouldQueue={props.shouldQueue}
								studio={props.studio}
								selectedPiece={undefined}
							/>
						)
					) : RundownLayoutsAPI.isExternalFrame(panel) ? (
						<ExternalFramePanel
							key={panel._id}
							panel={panel}
							layout={rundownLayout}
							visible={true}
							playlist={props.playlist}
						/>
					) : RundownLayoutsAPI.isAdLibRegion(panel) ? (
						<AdLibRegionPanel
							key={panel._id}
							includeGlobalAdLibs={true}
							filter={RundownLayoutsAPI.adLibRegionToFilter(panel)}
							panel={panel}
							adlibRank={panel.adlibRank}
							layout={rundownLayout}
							visible={true}
							playlist={props.playlist}
							showStyleBase={props.showStyleBase}
							studioMode={props.studioMode}
							selectedPiece={undefined}
							studio={props.studio}
							hotkeyGroup={panel.name.replace(/\W/, '_')}
						/>
					) : RundownLayoutsAPI.isKeyboardMap(panel) ? (
						<KeyboardPreviewPanel
							key={panel._id}
							visible={true}
							showStyleBase={props.showStyleBase}
							layout={rundownLayout}
							panel={panel}
						/>
					) : RundownLayoutsAPI.isPieceCountdown(panel) ? (
						<PieceCountdownPanel
							key={panel._id}
							panel={panel}
							layout={rundownLayout}
							playlist={props.playlist}
							visible={true}
						/>
					) : RundownLayoutsAPI.isNextInfo(panel) ? (
						<NextInfoPanel
							key={panel._id}
							panel={panel}
							layout={rundownLayout}
							playlist={props.playlist}
							visible={true}
						/>
					) : (
						undefined
					)
				)}
			{rundownLayout.actionButtons && (
				<DashboardActionButtonGroup
					playlist={props.playlist}
					buttons={rundownLayout.actionButtons}
					onChangeQueueAdLib={props.onChangeQueueAdLib}
					studioMode={props.studioMode}
				/>
			)}
		</div>
	)
}
