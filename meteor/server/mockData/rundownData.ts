import { Meteor } from 'meteor/meteor'
import { Rundowns } from '../../lib/collections/Rundowns'
import { SegmentLineItems } from '../../lib/collections/SegmentLineItems'
import { Random } from 'meteor/random'
import * as _ from 'underscore'
import { logger } from '../logging'
import { MediaObjects } from '../../lib/collections/MediaObjects'
import { setMeteorMethods } from '../methods'
import { getCurrentTime } from '../../lib/lib'
import { check } from 'meteor/check'
import { SegmentLines } from '../../lib/collections/SegmentLines'
import { updateSourceLayerInfinitesAfterLine } from '../api/playout'

// These are temporary method to fill the rundown database with some sample data
// for development

setMeteorMethods({

	'debug_scrambleDurations' () {
		let segmentLineItems = SegmentLineItems.find().fetch()
		_.each(segmentLineItems, (segmentLineItem) => {
			SegmentLineItems.update(
				{ _id: segmentLineItem._id },
				{$inc: {
					expectedDuration: ((Random.fraction() * 500) - 250)
				}}
			)
		})
	},

	'debug_purgeMediaDB' () {
		MediaObjects.remove({})
	},

	'debug_rundownSetStarttimeSoon' () {
		let rundown = Rundowns.findOne({
			active: true
		})
		if (rundown) {
			Rundowns.update(rundown._id, {$set: {
				expectedStart: getCurrentTime() + 70 * 1000
			}})
		}
	},

	'debug_removeRundown' (id: string) {
		logger.debug('Remove rundown "' + id + '"')

		const rundown = Rundowns.findOne(id)
		if (rundown) rundown.remove()
	},

	'debug_removeAllRos' () {
		logger.debug('Remove all rundowns')

		Rundowns.find({}).forEach((rundown) => {
			rundown.remove()
		})
	},

	'debug_updateSourceLayerInfinitesAfterLine' (rundownId: string, previousSlId?: string, runToEnd?: boolean) {
		check(rundownId, String)
		if (previousSlId) check(previousSlId, String)
		if (runToEnd !== undefined) check(runToEnd, Boolean)

		const rundown = Rundowns.findOne(rundownId)
		if (!rundown) throw new Meteor.Error(404, 'Rundown not found')

		const prevSl = previousSlId ? SegmentLines.findOne(previousSlId) : undefined

		updateSourceLayerInfinitesAfterLine(rundown, prevSl, runToEnd)

		logger.info('debug_updateSourceLayerInfinitesAfterLine: done')
	}
})
