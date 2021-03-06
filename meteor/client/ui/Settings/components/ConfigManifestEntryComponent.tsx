import * as React from 'react'
import * as _ from 'underscore'
import { withTranslation } from 'react-i18next'
import { PeripheralDevices } from '../../../../lib/collections/PeripheralDevices'
import { EditAttribute } from '../../../lib/EditAttribute'
import { Translated } from '../../../lib/ReactMeteorData/react-meteor-data'
import { ConfigManifestEntry, ConfigManifestEntryType } from '../../../../lib/api/deviceConfig'
import { ConfigManifestEntry as BlueprintConfigManifestEntry } from '@sofie-automation/blueprints-integration'
import { TransformedCollection } from '../../../../lib/typings/meteor'

export interface IConfigManifestEntryComponentProps {
	configField: ConfigManifestEntry | BlueprintConfigManifestEntry
	obj: object
	prefix?: string
	hideLabel?: boolean
	collection?: TransformedCollection<any, any>
	className?: string
}
export const ConfigManifestEntryComponent = withTranslation()(
	class ConfigManifestEntryComponent extends React.Component<Translated<IConfigManifestEntryComponentProps>, {}> {
		renderEditAttribute(configField: ConfigManifestEntry | BlueprintConfigManifestEntry, obj: object, prefix?: string) {
			let attribute = prefix + configField.id
			const opts = {
				modifiedClassName: 'bghl',
				attribute,
				obj,
				collection: this.props.collection || PeripheralDevices,
				label: (configField as ConfigManifestEntry).placeholder || '',
			}

			if (configField.type === ConfigManifestEntryType.FLOAT || configField.type === ConfigManifestEntryType.INT) {
				return <EditAttribute {...opts} type={configField.type} className="input text-input input-l"></EditAttribute>
			} else if (configField.type === ConfigManifestEntryType.STRING) {
				return <EditAttribute {...opts} type="text" className="input text-input input-l"></EditAttribute>
			} else if (configField.type === ConfigManifestEntryType.BOOLEAN) {
				return <EditAttribute {...opts} type="checkbox" className="input input-l"></EditAttribute>
			} else if (configField.type === ConfigManifestEntryType.ENUM) {
				return (
					<EditAttribute
						{...opts}
						type="dropdown"
						options={(configField as ConfigManifestEntry).values || []}
						className="input text-input input-l"></EditAttribute>
				)
			} else if (configField.type === ConfigManifestEntryType.OBJECT) {
				return (
					<EditAttribute
						{...opts}
						mutateDisplayValue={(v) => JSON.stringify(v, undefined, 2)}
						mutateUpdateValue={(v) => JSON.parse(v)}
						type="multiline"
						className="input text-input input-l"></EditAttribute>
				)
			} else if (configField.type === ConfigManifestEntryType.MULTILINE_STRING) {
				return (
					<EditAttribute
						{...opts}
						modifiedClassName="bghl"
						type="multiline"
						className="input text-input input-l"
						mutateDisplayValue={(v) => (v === undefined || v.length === 0 ? undefined : v.join('\n'))}
						mutateUpdateValue={(v) =>
							v === undefined || v.length === 0 ? undefined : v.split('\n').map((i) => i.trimStart())
						}
					/>
				)
			}
		}

		renderConfigField(configField: ConfigManifestEntry | BlueprintConfigManifestEntry, obj: object, prefix?: string) {
			const { t } = this.props

			return (
				<div className={this.props.className !== undefined ? this.props.className : 'mod mvs mhs'}>
					<label className="field">
						{t(configField.name)}
						{this.renderEditAttribute(configField, obj, prefix)}
					</label>
				</div>
			)
		}

		render() {
			const { configField, obj, prefix } = this.props

			return <div>{this.renderConfigField(configField, obj, prefix)}</div>
		}
	}
)
