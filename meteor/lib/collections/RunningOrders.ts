import { Mongo } from 'meteor/mongo'
import * as _ from 'underscore'
import { RundownAPI } from '../../lib/api/rundown'
import { Time, applyClassToDocument } from '../../lib/lib'
import { Segments, DBSegment, Segment } from './Segments'
import { SegmentLines, SegmentLine } from './SegmentLines'
import {
	IMOSExternalMetaData,
	IMOSObjectStatus,
	IMOSObjectAirStatus
} from 'mos-connection'
import { FindOptions, Selector, TransformedCollection } from './typings'

/** This is a very uncomplete mock-up of the Rundown object */
export interface DBRunningOrder {
	_id: string
	/** ID of the object in MOS */
	mosId: string
	studioInstallationId: string
	showStyleId: string
	/** Rundown slug - user-presentable name */
	name: string
	created: Time

	metaData?: Array<IMOSExternalMetaData>
	status?: IMOSObjectStatus
	airStatus?: IMOSObjectAirStatus
	// There should be something like a Owner user here somewhere?
	active?: boolean
	/** the id of the Live Segment Line - if empty, no segment line in this rundown is live */
	currentSegmentLineId: string | null
	/** the id of the Next Segment Line - if empty, no segment will follow Live Segment Line */
	nextSegmentLineId: string | null
}
export class RunningOrder implements DBRunningOrder {
	public _id: string
	public mosId: string
	public studioInstallationId: string
	public showStyleId: string
	public name: string
	public created: Time
	public metaData?: Array<IMOSExternalMetaData>
	public status?: IMOSObjectStatus
	public airStatus?: IMOSObjectAirStatus
	public active?: boolean
	public currentSegmentLineId: string | null
	public nextSegmentLineId: string | null

	constructor (document: DBRunningOrder) {
		_.each(_.keys(document), (key) => {
			this[key] = document[key]
		})
	}
	getSegments (selector?: Selector<DBSegment>, options?: FindOptions) {
		return Segments.find(
			_.extend({
				runningOrderId: this._id
			}, selector),
			_.extend({
				sort: {_rank: 1}
			}, options)
		).fetch()
	}
	getSegmentLines (selector?: Selector<SegmentLine>, options?: FindOptions) {
		return SegmentLines.find(
			_.extend({
				runningOrderId: this._id
			}, selector),
			_.extend({
				sort: {_rank: 1}
			}, options)
		).fetch()
	}
}

// export const RunningOrders = new Mongo.Collection<RunningOrder>('rundowns', {transform: (doc) => applyClassToDocument(RunningOrder, doc) })
export const RunningOrders: TransformedCollection<RunningOrder, DBRunningOrder>
	= new Mongo.Collection<RunningOrder>('rundowns', {transform: (doc) => applyClassToDocument(RunningOrder, doc) })

let c = RunningOrders
