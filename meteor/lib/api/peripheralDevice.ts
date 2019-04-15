import { Meteor } from 'meteor/meteor'
import { Random } from 'meteor/random'
import { MeteorPromiseCall, getCurrentTime } from '../lib'
import { PeripheralDeviceCommands } from '../collections/PeripheralDeviceCommands'
import { PubSub, meteorSubscribe } from './pubsub'

namespace PeripheralDeviceAPI {

export enum StatusCode {

	UNKNOWN = 0, 		// Status unknown
	GOOD = 1, 			// All good and green
	WARNING_MINOR = 2,	// Everything is not OK, operation is not affected
	WARNING_MAJOR = 3, 	// Everything is not OK, operation might be affected
	BAD = 4, 			// Operation affected, possible to recover
	FATAL = 5			// Operation affected, not possible to recover without manual interference
}

export interface StatusObject {
	statusCode: StatusCode,
	messages?: Array<string>
}

export enum DeviceType {
	MOSDEVICE = 0,
	PLAYOUT = 1,
	OTHER = 2, // i.e. sub-devices
	MEDIA_MANAGER = 3,
}
export interface InitOptions {
	type: DeviceType
	name: string
	connectionId: string
	parentDeviceId?: string
	versions?: {
		[libraryName: string]: string
	}
}
export type TimelineTriggerTimeResult = Array<{id: string, time: number}>

export interface SegmentLinePlaybackStartedResult {
	rundownId: string,
	slId: string,
	time: number
}
export type SegmentLinePlaybackStoppedResult = SegmentLinePlaybackStartedResult
export interface SegmentLineItemPlaybackStartedResult {
	rundownId: string,
	sliId: string,
	time: number
}
export type SegmentLineItemPlaybackStoppedResult = SegmentLineItemPlaybackStartedResult

export enum methods {
	'functionReply' 	= 'peripheralDevice.functionReply',

	'testMethod' 		= 'peripheralDevice.testMethod',
	'setStatus' 		= 'peripheralDevice.status',
	'ping' 				= 'peripheralDevice.ping',
	'initialize' 		= 'peripheralDevice.initialize',
	'unInitialize' 		= 'peripheralDevice.unInitialize',
	'getPeripheralDevice'= 'peripheralDevice.getPeripheralDevice',
	'pingWithCommand' 	= 'peripheralDevice.pingWithCommand',
	'killProcess' 		= 'peripheralDevice.killProcess',

	'determineDiffTime'		= 'systemTime.determineDiffTime',
	'getTimeDiff'			= 'systemTime.getTimeDiff',
	'getTime'				= 'systemTime.getTime',

	'timelineTriggerTime'			= 'peripheralDevice.timeline.setTimelineTriggerTime',
	'segmentLinePlaybackStarted' 	= 'peripheralDevice.rundown.segmentLinePlaybackStarted',
	'segmentLinePlaybackStopped' 	= 'peripheralDevice.rundown.segmentLinePlaybackStopped',
	'segmentLineItemPlaybackStarted'= 'peripheralDevice.rundown.segmentLineItemPlaybackStarted',
	'segmentLineItemPlaybackStopped'= 'peripheralDevice.rundown.segmentLineItemPlaybackStopped',

	'mosRundownCreate' 		= 'peripheralDevice.mos.rundownCreate',
	'mosRundownReplace' 		= 'peripheralDevice.mos.rundownReplace',
	'mosRundownDelete' 		= 'peripheralDevice.mos.rundownDelete',
	'mosRundownDeleteForce'	= 'peripheralDevice.mos.rundownDeleteForce',
	'mosRundownMetadata' 	= 'peripheralDevice.mos.rundownMetadata',
	'mosRundownStatus' 		= 'peripheralDevice.mos.rundownStatus',
	'mosRundownStoryStatus' 	= 'peripheralDevice.mos.rundownStoryStatus',
	'mosRundownItemStatus' 	= 'peripheralDevice.mos.rundownItemStatus',
	'mosRundownStoryInsert' 	= 'peripheralDevice.mos.rundownStoryInsert',
	'mosRundownStoryReplace' = 'peripheralDevice.mos.rundownStoryReplace',
	'mosRundownStoryMove' 	= 'peripheralDevice.mos.rundownStoryMove',
	'mosRundownStoryDelete' 	= 'peripheralDevice.mos.rundownStoryDelete',
	'mosRundownStorySwap' 	= 'peripheralDevice.mos.rundownStorySwap',
	'mosRundownItemInsert' 	= 'peripheralDevice.mos.rundownItemInsert',
	'mosRundownItemReplace' 	= 'peripheralDevice.mos.rundownItemReplace',
	'mosRundownItemMove' 	= 'peripheralDevice.mos.rundownItemMove',
	'mosRundownItemDelete' 	= 'peripheralDevice.mos.RundownItemDelete',
	'mosRundownItemSwap' 	= 'peripheralDevice.mos.RundownItemSwap',
	'mosRundownReadyToAir' 	= 'peripheralDevice.mos.RundownReadyToAir',
	'mosRundownFullStory' 	= 'peripheralDevice.mos.RundownFullStory',

	'dataRundownDelete'	= 'peripheralDevice.rundown.rundownDelete',
	'dataRundownCreate'	= 'peripheralDevice.rundown.rundownCreate',
	'dataRundownUpdate'	= 'peripheralDevice.rundown.rundownUpdate',
	'dataSegmentDelete'			= 'peripheralDevice.rundown.segmentDelete',
	'dataSegmentCreate'			= 'peripheralDevice.rundown.segmentCreate',
	'dataSegmentUpdate'			= 'peripheralDevice.rundown.segmentUpdate',
	'dataSegmentLineItemDelete'	= 'peripheralDevice.rundown.segmentLineItemDelete',
	'dataSegmentLineItemCreate'	= 'peripheralDevice.rundown.segmentLineItemCreate',
	'dataSegmentLineItemUpdate'	= 'peripheralDevice.rundown.segmentLineItemUpdate',

	'resyncRundown'			= 'peripheralDevice.mos.rundownResync',

	'getMediaObjectRevisions' 	= 'peripheralDevice.mediaScanner.getMediaObjectRevisions',
	'updateMediaObject' 		= 'peripheralDevice.mediaScanner.updateMediaObject',

	'getMediaWorkFlowRevisions' = 'peripheralDevice.mediaManager.getMediaWorkFlowRevisions',
	'updateMediaWorkFlow' = 'peripheralDevice.mediaManager.updateMediaWorkFlow',
	'getMediaWorkFlowStepRevisions' = 'peripheralDevice.mediaManager.getMediaWorkFlowStepRevisions',
	'updateMediaWorkFlowStep' = 'peripheralDevice.mediaManager.updateMediaWorkFlowStep',

	'requestUserAuthToken' 	= 'peripheralDevice.spreadsheet.requestUserAuthToken',
	'storeAccessToken' 	= 'peripheralDevice.spreadsheet.storeAccessToken',

}
export function initialize (id: string, token: string, options: InitOptions): Promise<string> {
	return MeteorPromiseCall(methods.initialize, id, token, options)
}
export function unInitialize (id: string, token: string, status: StatusObject): Promise<StatusObject> {
	return MeteorPromiseCall(methods.unInitialize, id, token)
}
export function setStatus (id: string, token: string, status: StatusObject): Promise<StatusObject> {
	return MeteorPromiseCall(methods.setStatus, id, token, status)
}

export function executeFunction (deviceId: string, cb: (err, result) => void, functionName: string, ...args: any[]) {

	let commandId = Random.id()
	PeripheralDeviceCommands.insert({
		_id: commandId,
		deviceId: deviceId,
		time: getCurrentTime(),
		functionName,
		args: args,
		hasReply: false
	})
	let subscription: Meteor.SubscriptionHandle | null = null
	if (Meteor.isClient) {
		subscription = meteorSubscribe(PubSub.peripheralDeviceCommands, deviceId )
	}
	const timeoutTime = 3000
	// logger.debug('command created: ' + functionName)
	const cursor = PeripheralDeviceCommands.find({
		_id: commandId
	})
	let observer: Meteor.LiveQueryHandle
	let timeoutCheck: number = 0
	// we've sent the command, let's just wait for the reply
	const checkReply = () => {
		let cmd = PeripheralDeviceCommands.findOne(commandId)
		// if (!cmd) throw new Meteor.Error('Command "' + commandId + '" not found')
		// logger.debug('checkReply')
		if (cmd) {
			if (cmd.hasReply) {
				// We've got a reply!
				// logger.debug('got reply ' + commandId)

				if (cmd.replyError) {
					cb(cmd.replyError, null)
				} else {
					cb(null, cmd.reply)
				}
				observer.stop()
				PeripheralDeviceCommands.remove(cmd._id)
				if (subscription) subscription.stop()
				if (timeoutCheck) {
					Meteor.clearTimeout(timeoutCheck)
					timeoutCheck = 0
				}
			} else if (getCurrentTime() - (cmd.time || 0) >= timeoutTime) { // timeout
				cb('Timeout when executing the function "' + cmd.functionName + '" on device "' + cmd.deviceId + '" ', null)
				observer.stop()
				PeripheralDeviceCommands.remove(cmd._id)
				if (subscription) subscription.stop()
			}
		} else {
			// logger.debug('Command "' + commandId + '" not found when looking for reply')
		}
	}

	observer = cursor.observeChanges({
		added: checkReply,
		changed: checkReply,
	})
	timeoutCheck = Meteor.setTimeout(checkReply, timeoutTime)
}

}

export { PeripheralDeviceAPI }
