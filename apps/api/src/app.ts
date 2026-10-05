import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';

import { errorHandler } from './middleware/errorHandler';
import { applicationRouter } from './routes/application.routes';
import { authRouter } from './routes/auth.routes';
import { companyRouter } from './routes/company.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { tagRouter } from './routes/tag.routes';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/companies', companyRouter);
app.use('/api/applications', applicationRouter);
app.use('/api/tags', tagRouter);
app.use('/api/dashboard', dashboardRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  errorHandler(err, req, res, next);
});