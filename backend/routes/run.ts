import { Router } from 'express'
import { runCode } from '../controllers/runController'

const router = Router()

router.post('/', runCode)

export default router
