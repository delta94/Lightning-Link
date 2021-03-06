import express from 'express';
import cors from 'cors';
import * as http from 'http';
import { rateLimit } from '../ratelimiter';
import { router as shortenRoutes } from './shortenRoutes';
import { router as loginRoutes } from './loginRoutes';
import { router as analyticRoutes } from './analyticRoutes';
import request from 'request';

// CORS Origins
const origins = process.env.ORIGIN_URL;

export default class ApiServer {
  constructor(counterURL: string, port: string) {
    // Start app
    let app = express();
    let server = http.createServer(app);

    // Server setup
    app.disable('x-powered-by');
    app.use(cors({ origin: origins, credentials: true }));
    app.use(rateLimit);

    // Bind routes
    app.use(loginRoutes);
    app.use(shortenRoutes);
    app.use(analyticRoutes);

    app.use(function(req, res, next) {
      res.status(404).send('Route not found');
    });

    // Server listen on Port
    server.listen(port, function() {
      console.log(`API Server Listening on ${port}`);
    });

    // Get count from counter server
    request(`${counterURL}/count?serverPort=${port}`, (err, res, body) => {
      let counts = JSON.parse(body);
      app.set('startCount', counts.startCount);
      app.set('currentCount', counts.currentCount);
      app.set('counterURL', counterURL);
      app.set('port', port);
    });

    return app;
  }
}
