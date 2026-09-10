export interface Setting {
  id: number
  key: string
  value: string
  type: string
  createdAt: string
  updatedAt: string
}

export interface UpdateSettingDTO {
  value: string
}

export interface BulkUpdateSettingsDTO {
  settings: Array<{ key: string; value: string }>
}
