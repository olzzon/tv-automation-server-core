import { PieceId } from './Pieces'
import { TransformedCollection } from '../typings/meteor'
import { registerCollection } from '../lib'
import { IBlueprintAdLibPiece } from '@sofie-automation/blueprints-integration'
import { createMongoCollection } from './lib'
import { RundownImportVersions } from './Rundowns'
import { StudioId } from './Studios'
import { ShowStyleVariantId } from './ShowStyleVariants'
import { BucketId } from './Buckets'
import { registerIndex } from '../database'

export interface BucketAdLib extends IBlueprintAdLibPiece {
	_id: PieceId
	bucketId: BucketId

	/**
	 * If an AdLib within the Bucket doesn't match the studioId/showStyleVariantId combination
	 * the adLib will be shown as disabled
	 */
	studioId: StudioId
	showStyleVariantId: ShowStyleVariantId
	importVersions: RundownImportVersions // TODO - is this good?
}

export const BucketAdLibs: TransformedCollection<BucketAdLib, BucketAdLib> = createMongoCollection<BucketAdLib>(
	'bucketAdlibs'
)
registerCollection('BucketAdLibs', BucketAdLibs)

registerIndex(BucketAdLibs, {
	bucketId: 1,
	studioId: 1,
})
