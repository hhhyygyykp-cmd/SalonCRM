import { AL_AIN_CITY_AREAS, AL_AIN_OUTLYING_AREAS, canonicalArea, isOfficialArea } from '../lib/areas'
import { Select } from './ui'

export function AreaSelect({
  value,
  onChange,
  label = 'Area',
}: {
  value: string
  onChange: (value: string) => void
  label?: string
}) {
  const current = canonicalArea(value)
  const keepExisting = current && !isOfficialArea(current) ? current : ''

  return (
    <Select label={label} value={current} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select area…</option>
      {keepExisting ? <option value={keepExisting}>{keepExisting}</option> : null}
      <optgroup label="Al Ain">
        {AL_AIN_CITY_AREAS.map((area) => (
          <option key={area} value={area}>
            {area}
          </option>
        ))}
      </optgroup>
      <optgroup label="Around Al Ain">
        {AL_AIN_OUTLYING_AREAS.map((area) => (
          <option key={area} value={area}>
            {area}
          </option>
        ))}
      </optgroup>
    </Select>
  )
}
