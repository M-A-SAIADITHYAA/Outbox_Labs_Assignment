import { Router } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailDispatchQueue } from '../queues/email.queue';
import { emailIndexingQueue } from '../queues/indexing.queue';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(emailDispatchQueue) as any,
    new BullMQAdapter(emailIndexingQueue) as any,
  ],
  serverAdapter,
});

export default serverAdapter.getRouter();
