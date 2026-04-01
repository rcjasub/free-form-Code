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
  return result.rows[0];
}

export async function getById(canvasId: string): Promise<Canvas | null> {    
    const result = await pool.query<Canvas>(
      `SELECT * FROM canvases WHERE id = $1`,
      [canvasId]
    )   
    return result.rows[0] ?? null;
  }    

  export async function getCanvasByShareId(id: string): Promise<Canvas | null> {
    const result = await pool.query<Canvas>(
      'SELECT * FROM canvases WHERE share_id = $1',
      [id]
    )
     return result.rows[0] ?? null;
  }

  export async function updateCanvasName(canvasId: string, name: string): Promise<Canvas> {
    const result = await pool.query<Canvas>(
      `UPDATE canvases SET name = $1 WHERE id = $2 RETURNING *`,
      [name, canvasId]
    );
    return result.rows[0];
  }

  export async function getByUserId(userId: string): Promise<Canvas[]> {
    const result = await pool.query<Canvas>(
      `SELECT * FROM canvases WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    )
    return result.rows;
  }

  export async function deleteCanvas(canvasId: string): Promise<Canvas> {
    const result = await pool.query<Canvas>(
      `DELETE FROM canvases WHERE id = $1 RETURNING *`,
      [canvasId]
    )
    return result.rows[0]; 
  }