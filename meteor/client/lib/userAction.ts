import * as i18next from 'i18next'
import {
	NotificationCenter,
	Notification,
	NoticeLevel
} from './notifications/notifications'
import { ClientAPI } from '../../lib/api/client'
import { Meteor } from 'meteor/meteor'
import { eventContextForLog } from './clientAPI'

export enum UserAction {
	SAVE_EVALUATION,
	ACTIVATE_RUNDOWN_PLAYLIST,
	DEACTIVATE_RUNDOWN_PLAYLIST,
	CREATE_SNAPSHOT_FOR_DEBUG,
	REMOVE_RUNDOWN_PLAYLIST,
	REMOVE_RUNDOWN,
	RESYNC_RUNDOWN_PLAYLIST,
	RESYNC_SEGMENT,
	DISABLE_NEXT_PIECE,
	TAKE,
	MOVE_NEXT,
	ACTIVATE_HOLD,
	DEACTIVATE_OTHER_RUNDOWN_PLAYLIST,
	RESET_AND_ACTIVATE_RUNDOWN_PLAYLIST,
	PREPARE_FOR_BROADCAST,
	RESET_RUNDOWN_PLAYLIST,
	RELOAD_RUNDOWN_DATA,
	TOGGLE_PART_ARGUMENT,
	SET_NEXT,
	SET_NEXT_SEGMENT,
	TAKE_PIECE,
	UNSYNC_RUNDOWN,
	SET_IN_OUT_POINTS,
	START_ADLIB,
	START_GLOBAL_ADLIB,
	START_STICKY_PIECE,
	START_BUCKET_ADLIB,
	CLEAR_SOURCELAYER,
	RESTART_MEDIA_WORKFLOW,
	ABORT_MEDIA_WORKFLOW,
	PRIORITIZE_MEDIA_WORKFLOW,
	ABORT_ALL_MEDIA_WORKFLOWS,
	GENERATE_RESTART_TOKEN,
	RESTART_CORE,
	STOP_RECORDING,
	START_RECORDING,
	DELETE_RECORDING,
	USER_LOG_PLAYER_METHOD,
	UNKNOWN_ACTION,
	CREATE_BUCKET,
	REMOVE_BUCKET,
	MODIFY_BUCKET,
	EMPTY_BUCKET,
	INGEST_BUCKET_ADLIB,
	REMOVE_BUCKET_ADLIB,
	MODIFY_BUCKET_ADLIB,
}

function userActionToLabel(userAction: UserAction, t: i18next.TranslationFunction<any, object, string>) {
	switch (userAction) {
		case UserAction.SAVE_EVALUATION:
			return t('Saving Evaluation')
		case UserAction.DEACTIVATE_RUNDOWN_PLAYLIST:
			return t('Deactivating Rundown Playlist')
		case UserAction.CREATE_SNAPSHOT_FOR_DEBUG:
			return t('Creating Snapshot for debugging')
		case UserAction.REMOVE_RUNDOWN_PLAYLIST:
			return t('Removing Rundown Playlist')
		case UserAction.RESYNC_RUNDOWN_PLAYLIST:
			return t('Re-Syncing Rundown Playlist')
		case UserAction.RESYNC_SEGMENT:
			return t('Resync Segment')
		case UserAction.DISABLE_NEXT_PIECE:
			return t('Disabling next Piece')
		case UserAction.TAKE:
			return t('Take')
		case UserAction.MOVE_NEXT:
			return t('Moving Next')
		case UserAction.ACTIVATE_HOLD:
			return t('Activating Hold')
		case UserAction.DEACTIVATE_OTHER_RUNDOWN_PLAYLIST:
			return t('Deactivating other Rundown Playlist, and activating this one')
		case UserAction.ACTIVATE_RUNDOWN_PLAYLIST:
			return t('Activating Rundown Playlist')
		case UserAction.RESET_AND_ACTIVATE_RUNDOWN_PLAYLIST:
			return t('Resetting and activating Rundown Playlist')
		case UserAction.PREPARE_FOR_BROADCAST:
			return t('Preparing for broadcast')
		case UserAction.RESET_RUNDOWN_PLAYLIST:
			return t('Resetting Rundown Playlist')
		case UserAction.RELOAD_RUNDOWN_DATA:
			return t('Reloading Rundown Playlist Data')
		case UserAction.TOGGLE_PART_ARGUMENT:
			return t('Toggling Part Argument')
		case UserAction.SET_NEXT:
			return t('Setting Next')
		case UserAction.SET_NEXT_SEGMENT:
			return t('Setting Next Segment')
		case UserAction.TAKE_PIECE:
			return t('Taking Piece')
		case UserAction.UNSYNC_RUNDOWN:
			return t('Unsyncing Rundown')
		case UserAction.REMOVE_RUNDOWN:
			return t('Removing Rundown')
		case UserAction.SET_IN_OUT_POINTS:
			return t('Set In & Out points')
		case UserAction.START_ADLIB:
			return t('Starting AdLib')
		case UserAction.START_GLOBAL_ADLIB:
			return t('Starting Global AdLib')
		case UserAction.START_STICKY_PIECE:
			return t('Starting Sticky Piece')
		case UserAction.CLEAR_SOURCELAYER:
			return t('Clearing SourceLayer')
		case UserAction.RESTART_MEDIA_WORKFLOW:
			return t('Restarting Media Workflow')
		case UserAction.ABORT_MEDIA_WORKFLOW:
			return t('Aborting Media Workflow')
		case UserAction.PRIORITIZE_MEDIA_WORKFLOW:
			return t('Prioritizing Media Workflow')
		case UserAction.ABORT_ALL_MEDIA_WORKFLOWS:
			return t('Aborting all Media Workflows')
		case UserAction.GENERATE_RESTART_TOKEN:
			return t('Generating restart token')
		case UserAction.RESTART_CORE:
			return t('Restarting Sofie Core')
		case UserAction.STOP_RECORDING:
			return t('Stopping recording')
		case UserAction.START_RECORDING:
			return t('Starting recording')
		case UserAction.DELETE_RECORDING:
			return t('Deleting recording')
		case UserAction.USER_LOG_PLAYER_METHOD:
			return t('Method ${method}')
		case UserAction.CREATE_BUCKET:
			return t('Creating a new Bucket')
		case UserAction.EMPTY_BUCKET:
			return t('Emptying Bucket')
		case UserAction.INGEST_BUCKET_ADLIB:
			return t('Importing an AdLib to the Bucket')
		case UserAction.MODIFY_BUCKET:
			return t('Modifying Bucket')
		case UserAction.MODIFY_BUCKET_ADLIB:
			return t('Modifying Bucket AdLib')
		case UserAction.REMOVE_BUCKET:
			return t('Removing Bucket')
		case UserAction.REMOVE_BUCKET_ADLIB:
			return t('Removing Bucket AdLib')
		case UserAction.START_BUCKET_ADLIB:
			return t('Starting Bucket AdLib')
		case UserAction.UNKNOWN_ACTION:
		default:
			return t('Unknown action')
	}
}

export function doUserAction<Result>(
	t: i18next.TranslationFunction<any, object, string>,
	userEvent: any,
	action: UserAction,
	fcn: (event: any) => Promise<ClientAPI.ClientResponse<Result>>,
	callback?: (err: any, res?: Result) => void | boolean,
	okMessage?: string
) {
	const actionName = userActionToLabel(action, t)

	// Display a progress message, if the method takes a long time to execute:
	let timeoutMessage: Notification | null = null
	let timeout = Meteor.setTimeout(() => {
		timeoutMessage = new Notification(undefined, NoticeLevel.NOTIFICATION, t('Waiting for action: {{actionName}}...', { actionName: actionName }), 'userAction')
		NotificationCenter.push(timeoutMessage)
	}, 2000)

	const clearMethodTimeout = () => {
		if (!timeoutMessage) {
			// cancel progress message:
			Meteor.clearTimeout(timeout)
		} else {
			try {
				timeoutMessage.drop()
			} catch (e) {
				// message was already dropped, that's fine
			}
		}
	}

	fcn(eventContextForLog(userEvent)).then((res: ClientAPI.ClientResponseSuccess<Result>) => {
		clearMethodTimeout()

		if (ClientAPI.isClientResponseError(res)) {
			let doDefault: boolean | void = true
			if (callback) {
				doDefault = callback(res)
			}
			if (doDefault !== false) {
				NotificationCenter.push(
					new Notification(undefined, NoticeLevel.CRITICAL,
						t('Action {{actionName}} failed: {{error}}', { error: res.message || res.error, actionName: actionName })
						, 'userAction')
				)
				navigator.vibrate([400, 300, 400, 300, 400])
			}
		} else {
			let doDefault: boolean | void = true
			// all good
			if (callback) {
				doDefault = callback(undefined, res.result)
			}
			if (timeoutMessage && doDefault !== false) {
				NotificationCenter.push(
					new Notification(undefined, NoticeLevel.NOTIFICATION,
						okMessage || t('Action {{actionName}} done!', { actionName: actionName })
						, 'userAction', undefined, false, undefined, undefined, 2000)
				)
			}
		}
	}).catch((err) => {
		clearMethodTimeout()
		// console.error(err) - this is a result of an error server-side. Will be logged, no reason to print it out to console
		let doDefault: boolean | void = true
		if (callback) {
			doDefault = callback(err)
		}
		if (doDefault !== false) {
			NotificationCenter.push(
				new Notification(undefined, NoticeLevel.CRITICAL, t('{{actionName}} failed! More information can be found in the system log.', { actionName: actionName }), 'userAction')
			)
			navigator.vibrate([400, 300, 400, 300, 400])
		}
	})
}

function userActionMethodName(
	t: i18next.TranslationFunction<any, object, string>,
	method: UserActionAPIMethods
) {
	switch (method) {
		// @todo: go through these and set better names:
		case UserActionAPIMethods.take: return t('Take')
		case UserActionAPIMethods.setNext: return t('Setting Next')
		case UserActionAPIMethods.moveNext: return t('Moving Next')

		case UserActionAPIMethods.prepareForBroadcast: return t('Preparing for broadcast')
		case UserActionAPIMethods.resetRundownPlaylist: return t('Resetting Rundown')
		case UserActionAPIMethods.resetAndActivate: return t('Resetting and activating Rundown')
		case UserActionAPIMethods.activate: return t('Activating Rundown')
		case UserActionAPIMethods.deactivate: return t('Deactivating Rundown')
		case UserActionAPIMethods.reloadData: return t('Reloading rundown data')

		case UserActionAPIMethods.disableNextPiece: return t('Disabling next piece')
		case UserActionAPIMethods.togglePartArgument: return t('Toggling Part-Argument')
		case UserActionAPIMethods.pieceTakeNow: return t('Taking Piece')

		case UserActionAPIMethods.segmentAdLibPieceStart: return t('Starting AdLib-piece')
		case UserActionAPIMethods.baselineAdLibPieceStart: return t('Starting AdLib-piece')
		// case UserActionAPIMethods.segmentAdLibPieceStop: return t('Stopping AdLib-piece')

		case UserActionAPIMethods.sourceLayerStickyPieceStart: return t('Starting sticky-pice')

		case UserActionAPIMethods.activateHold: return t('Activating Hold')

		case UserActionAPIMethods.saveEvaluation: return t('Saving Evaluation')

		case UserActionAPIMethods.storeRundownSnapshot: return t('Creating Snapshot for debugging')

		case UserActionAPIMethods.sourceLayerOnPartStop: return t('Stopping source layer')

		case UserActionAPIMethods.removeRundown: return t('Removing Rundown')
		case UserActionAPIMethods.resyncRundown: return t('Re-Syncing Rundown')

		case UserActionAPIMethods.recordStop: return t('Stopping recording')
		case UserActionAPIMethods.recordStart: return t('Starting recording')
		case UserActionAPIMethods.recordDelete: return t('Deleting recording')

		case UserActionAPIMethods.setInOutPoints: return t('Setting In/Out points')

		case UserActionAPIMethods.bucketAdlibImport: return t('Importing Bucker Adlib-piece')
		case UserActionAPIMethods.bucketAdlibStart: return t('Starting Bucket Adlib-piece')

		case UserActionAPIMethods.bucketsCreateNewBucket: return t('Creating Bucket')
		case UserActionAPIMethods.bucketsRemoveBucket: return t('Deleting Bucket')
		case UserActionAPIMethods.bucketsEmptyBucket: return t('Emptying Bucket')
		case UserActionAPIMethods.bucketsModifyBucket: return t('Chaning Bucket')
		case UserActionAPIMethods.bucketsRemoveBucketAdLib: return t('Removing Bucket Adlib-piece')
	}
	return method // fallback
}
