import '../../../../../__mocks__/_extendJest'
import {
	setupDefaultStudioEnvironment,
	DefaultEnvironment,
	setupDefaultRundownPlaylist,
} from '../../../../../__mocks__/helpers/database'
import { DBRundown, RundownId, Rundowns } from '../../../../../lib/collections/Rundowns'
import { RundownPlaylist, RundownPlaylistId, RundownPlaylists } from '../../../../../lib/collections/RundownPlaylists'
import { getCurrentTime, protectString } from '../../../../../lib/lib'
import { SegmentId, Segments } from '../../../../../lib/collections/Segments'
import { DBPart, Part, PartId, Parts } from '../../../../../lib/collections/Parts'
import { LookaheadMode, TSR } from '@sofie-automation/blueprints-integration'
import { MappingsExt, Studios } from '../../../../../lib/collections/Studios'
import { PartInstances, wrapPartToTemporaryInstance } from '../../../../../lib/collections/PartInstances'
import _ from 'underscore'
import { wrapWithCacheForRundownPlaylist } from '../../../../DatabaseCaches'
import { testInFiber } from '../../../../../__mocks__/helpers/jest'
import { getOrderedPartsAfterPlayhead } from '../util'

describe('getOrderedPartsAfterPlayhead', () => {
	let env: DefaultEnvironment
	let playlistId: RundownPlaylistId
	let rundownId: RundownId
	let segmentId0: SegmentId
	let segmentId1: SegmentId
	let segmentId2: SegmentId
	let partIds: PartId[]

	beforeEach(() => {
		env = setupDefaultStudioEnvironment()

		const mappings: MappingsExt = {}
		for (const k of Object.keys(LookaheadMode)) {
			mappings[k] = {
				device: TSR.DeviceType.ABSTRACT,
				deviceId: 'fake0',
				lookahead: LookaheadMode[k],
				// lookaheadDepth: 0,
				// lookaheadMaxSearchDistance: 0,
			}
		}
		Studios.update(env.studio._id, { $set: { mappings } })
		;({ playlistId, rundownId } = setupDefaultRundownPlaylist(
			env,
			undefined,
			(env: DefaultEnvironment, playlistId: RundownPlaylistId, rundownId: RundownId) => {
				const rundown: DBRundown = {
					peripheralDeviceId: env.ingestDevice._id,
					organizationId: null,
					studioId: env.studio._id,
					showStyleBaseId: env.showStyleBase._id,
					showStyleVariantId: env.showStyleVariant._id,

					playlistId: playlistId,
					_rank: 0,

					_id: rundownId,
					externalId: 'MOCK_RUNDOWN',
					name: 'Default Rundown',

					created: getCurrentTime(),
					modified: getCurrentTime(),
					importVersions: {
						studio: '',
						showStyleBase: '',
						showStyleVariant: '',
						blueprint: '',
						core: '',
					},

					dataSource: 'mock',
					externalNRCSName: 'mock',
				}
				Rundowns.insert(rundown)

				segmentId0 = Segments.insert({
					_id: protectString(rundownId + '_segment0'),
					_rank: 0,
					externalId: 'MOCK_SEGMENT_0',
					rundownId: rundown._id,
					name: 'Segment 0',
					externalModified: 1,
				})
				segmentId1 = Segments.insert({
					_id: protectString(rundownId + '_segment01'),
					_rank: 1,
					externalId: 'MOCK_SEGMENT_1',
					rundownId: rundown._id,
					name: 'Segment 1',
					externalModified: 1,
				})
				segmentId2 = Segments.insert({
					_id: protectString(rundownId + '_segment2'),
					_rank: 2,
					externalId: 'MOCK_SEGMENT_2',
					rundownId: rundown._id,
					name: 'Segment 2',
					externalModified: 1,
				})

				function createMockPart(index: number, segId: SegmentId): DBPart {
					return {
						_id: protectString(rundownId + '_part' + index),
						segmentId: segId,
						rundownId: rundown._id,
						_rank: index,
						externalId: 'MOCK_PART_' + index,
						title: 'Part ' + index,
					}
				}

				partIds = [
					Parts.insert(createMockPart(0, segmentId0)),
					Parts.insert(createMockPart(1, segmentId0)),
					Parts.insert(createMockPart(2, segmentId0)),
					Parts.insert(createMockPart(3, segmentId0)),
					Parts.insert(createMockPart(4, segmentId0)),

					Parts.insert(createMockPart(10, segmentId1)),
					Parts.insert(createMockPart(11, segmentId1)),
					Parts.insert(createMockPart(12, segmentId1)),

					Parts.insert(createMockPart(20, segmentId2)),
					Parts.insert(createMockPart(21, segmentId2)),
					Parts.insert(createMockPart(22, segmentId2)),
				]

				return rundownId
			}
		))
	})
	testInFiber('all parts come back', () => {
		const playlist = RundownPlaylists.findOne(playlistId) as RundownPlaylist
		expect(playlist).toBeTruthy()

		const parts = wrapWithCacheForRundownPlaylist(playlist, (cache) =>
			getOrderedPartsAfterPlayhead(cache, playlist, 100)
		)
		expect(parts.map((p) => p._id)).toEqual(partIds)
	})

	testInFiber('first part is next', () => {
		const playlist = RundownPlaylists.findOne(playlistId) as RundownPlaylist
		expect(playlist).toBeTruthy()

		const firstPart = Parts.findOne(partIds[0]) as Part
		expect(firstPart).toBeTruthy()

		// Convert to instance and set as next
		const firstInstanceId = PartInstances.insert(wrapPartToTemporaryInstance(firstPart))
		playlist.nextPartInstanceId = firstInstanceId

		const parts = wrapWithCacheForRundownPlaylist(playlist, (cache) =>
			getOrderedPartsAfterPlayhead(cache, playlist, 100)
		)
		// Should not have the first
		expect(parts.map((p) => p._id)).toEqual(partIds.slice(1))

		// Try with a limit
		const parts2 = wrapWithCacheForRundownPlaylist(playlist, (cache) =>
			getOrderedPartsAfterPlayhead(cache, playlist, 5)
		)
		// Should not have the first
		expect(parts2.map((p) => p._id)).toEqual(partIds.slice(1, 6))
	})

	testInFiber('first part is current', () => {
		const playlist = RundownPlaylists.findOne(playlistId) as RundownPlaylist
		expect(playlist).toBeTruthy()

		const firstPart = Parts.findOne(partIds[0]) as Part
		expect(firstPart).toBeTruthy()

		// Convert to instance and set as next
		const firstInstanceId = PartInstances.insert(wrapPartToTemporaryInstance(firstPart))
		playlist.currentPartInstanceId = firstInstanceId

		const parts = wrapWithCacheForRundownPlaylist(playlist, (cache) =>
			getOrderedPartsAfterPlayhead(cache, playlist, 100)
		)
		// Should not have the first
		expect(parts.map((p) => p._id)).toEqual(partIds.slice(1))

		// Try with a limit
		const parts2 = wrapWithCacheForRundownPlaylist(playlist, (cache) =>
			getOrderedPartsAfterPlayhead(cache, playlist, 5)
		)
		// Should not have the first
		expect(parts2.map((p) => p._id)).toEqual(partIds.slice(1, 6))
	})

	testInFiber('last part is next', () => {
		const playlist = RundownPlaylists.findOne(playlistId) as RundownPlaylist
		expect(playlist).toBeTruthy()

		const lastPart = Parts.findOne(_.last(partIds)) as Part
		expect(lastPart).toBeTruthy()

		// Convert to instance and set as next
		const lastInstanceId = PartInstances.insert(wrapPartToTemporaryInstance(lastPart))
		playlist.currentPartInstanceId = lastInstanceId

		const parts = wrapWithCacheForRundownPlaylist(playlist, (cache) =>
			getOrderedPartsAfterPlayhead(cache, playlist, 100)
		)
		// Should be empty
		expect(parts.map((p) => p._id)).toEqual([])

		// TODO - fix looping
		// // Playlist could loop
		// playlist.loop = true
		// const parts2 = wrapWithCacheForRundownPlaylist(playlist, (cache) =>
		// 	getOrderedPartsAfterPlayhead(cache, playlist, 5)
		// )
		// // Should be empty
		// expect(parts2.map((p) => p._id)).toEqual(['a'])

		// // TODO - filter unplayable

		// // Set some parts as unplayable
		// Parts.update(
		// 	{
		// 		_id: { $in: [partIds[1], partIds[4]] },
		// 	},
		// 	{
		// 		$set: { invalid: true },
		// 	}
		// )
		// const parts3 = wrapWithCacheForRundownPlaylist(playlist, (cache) =>
		// 	getOrderedPartsAfterPlayhead(cache, playlist, 5)
		// )
		// // Should be empty
		// expect(parts3.map((p) => p._id)).toEqual(['a'])
	})

	testInFiber('filter unplayable part is current', () => {
		const playlist = RundownPlaylists.findOne(playlistId) as RundownPlaylist
		expect(playlist).toBeTruthy()

		const nextPart = Parts.findOne(partIds[3]) as Part
		expect(nextPart).toBeTruthy()

		Parts.update(
			{
				_id: { $in: [partIds[4], partIds[7]] },
			},
			{
				$set: { invalid: true },
			}
		)

		// Convert to instance and set as next
		const nextInstanceId = PartInstances.insert(wrapPartToTemporaryInstance(nextPart))
		playlist.currentPartInstanceId = nextInstanceId

		const parts = wrapWithCacheForRundownPlaylist(playlist, (cache) =>
			getOrderedPartsAfterPlayhead(cache, playlist, 5)
		)
		// Should not have the first
		expect(parts.map((p) => p._id)).toEqual([partIds[5], partIds[6], partIds[8], partIds[9], partIds[10]])
	})

	testInFiber('filter unplayable part is current', () => {
		const playlist = RundownPlaylists.findOne(playlistId) as RundownPlaylist
		expect(playlist).toBeTruthy()

		const firstPart = Parts.findOne(partIds[0]) as Part
		expect(firstPart).toBeTruthy()

		// Convert to instance and set as next
		const nextInstanceId = PartInstances.insert(wrapPartToTemporaryInstance(firstPart))
		playlist.currentPartInstanceId = nextInstanceId

		// Change next segment
		playlist.nextSegmentId = segmentId2
		const parts = wrapWithCacheForRundownPlaylist(playlist, (cache) =>
			getOrderedPartsAfterPlayhead(cache, playlist, 10)
		)
		expect(parts.map((p) => p._id)).toEqual([...partIds.slice(1, 5), ...partIds.slice(8)])

		// Set start of next segment to unplayable
		Parts.update(
			{
				_id: { $in: [partIds[8]] },
			},
			{
				$set: { invalid: true },
			}
		)
		const parts2 = wrapWithCacheForRundownPlaylist(playlist, (cache) =>
			getOrderedPartsAfterPlayhead(cache, playlist, 10)
		)
		expect(parts2.map((p) => p._id)).toEqual([...partIds.slice(1, 5), ...partIds.slice(9)])

		// Set the rest of next segment to unplayable
		Parts.update(
			{
				_id: { $in: partIds.slice(9) },
			},
			{
				$set: { invalid: true },
			}
		)
		const parts3 = wrapWithCacheForRundownPlaylist(playlist, (cache) =>
			getOrderedPartsAfterPlayhead(cache, playlist, 10)
		)
		expect(parts3.map((p) => p._id)).toEqual(partIds.slice(1, 8))
	})
})
