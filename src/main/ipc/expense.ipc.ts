import { ipcMain } from 'electron'
import { ExpenseService } from '../services/expense.service'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { CreateExpenseDTO } from '@shared/types/expense'

const expenseService = new ExpenseService()

export function registerExpenseIpc(): void {
  ipcMain.handle(IPC_CHANNELS.EXPENSES_LIST_BY_DATE, (_event, date: string) =>
    expenseService.listForDate(date)
  )
  ipcMain.handle(IPC_CHANNELS.EXPENSES_DAY_SUMMARY, (_event, date: string) =>
    expenseService.daySummary(date)
  )
  ipcMain.handle(
    IPC_CHANNELS.EXPENSES_RANGE_SUMMARY,
    (_event, args: { from: string; to: string }) => expenseService.rangeSummary(args.from, args.to)
  )
  ipcMain.handle(IPC_CHANNELS.EXPENSES_SAVE, (_event, data: CreateExpenseDTO) =>
    expenseService.save(data)
  )
  ipcMain.handle(IPC_CHANNELS.EXPENSES_DELETE, (_event, id: number) => {
    expenseService.delete(id)
    return { success: true }
  })
}