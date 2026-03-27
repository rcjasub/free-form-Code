import { Router } from 'express'
import { createCanvas } from '../controllers/canvasController'

const router = Router()

router.post('/', createCanvas)

export default router
