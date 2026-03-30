import pool from '../db'

 export interface Block {
    id: string
    canvas_id: string
    type: string
    content: string
    x: number
    y: number
    width: number
    created_at: Date
    updated_at: Date
  }

  export async function getBlocksByCanvasId(canvasId: string): Promise<Block[]> {    
    const result = await pool.query<Block>(
      'SELECT * FROM blocks WHERE canvas_id = $1',
      [canvasId]
    )
    return result.rows
  }
