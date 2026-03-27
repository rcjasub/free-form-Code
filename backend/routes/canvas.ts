import { Router } from 'express'
import { createCanvas } from '../controllers/canvasController'
import { getCanvasById } from '../controllers/canvasController'

const router = Router()

router.post('/', createCanvas)
router.get('/:id', getCanvasById)

export default router
