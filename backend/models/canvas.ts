import pool from '../db'

export interface Canvas {
  id: string
  user_id: string
  name: string
  share_id: string
  is_public: boolean
  created_at: Date
  updated_at: Date
}

export interface CreateCanvasParams {
  user_id: string
  name: string
  share_id: string
  is_public: boolean
}

export async function create(params: CreateCanvasParams): Promise<Canvas> {
  const { user_id, name, share_id, is_public } = params
  const result = await pool.query<Canvas>(
    `INSERT INTO canvases (user_id, name, share_id, is_public)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [user_id, name, share_id, is_public]
  )
  return result.rows[0]
}

export async function getById(id: string): Promise<Canvas | null> {          
    const result = await.pool.query<canvas>(
      SELECT * FROM canvases WHERE id = $1,
    )                                                                                                      
  }    