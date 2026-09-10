import { SettingsRepository } from '../repositories/settings.repository'
import type { Setting, UpdateSettingDTO, BulkUpdateSettingsDTO } from '@shared/types/setting'

export class SettingsService {
  private settingsRepo = new SettingsRepository()

  list(): Setting[] {
    return this.settingsRepo.findAll()
  }

  get(key: string): Setting | null {
    return this.settingsRepo.findByKey(key)
  }

  getValue(key: string): string | null {
    return this.settingsRepo.getValue(key)
  }

  set(key: string, value: string, type: string): Setting {
    return this.settingsRepo.upsert(key, value, type)
  }

  update(key: string, data: UpdateSettingDTO): Setting {
    return this.settingsRepo.update(key, data)
  }

  bulkUpdate(data: BulkUpdateSettingsDTO): void {
    this.settingsRepo.bulkUpdate(data)
  }

  delete(key: string): void {
    this.settingsRepo.delete(key)
  }
}
