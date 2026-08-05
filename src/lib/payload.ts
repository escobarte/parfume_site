import { getPayload } from 'payload'
import config from '@/payload.config'

/** Данные берём через Local API, не через HTTP (CLAUDE.md, каркас). */
export const getPayloadClient = () => getPayload({ config })
