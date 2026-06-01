import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../errors/http-error';
import { logger } from '../lib/logger';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Rota nao encontrada: ${req.path}` });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Parametros invalidos.',
      details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  logger.error({ err, path: req.path }, 'Unhandled server error');
  res.status(500).json({ error: 'Erro interno no servidor.' });
}
