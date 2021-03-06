const envPath = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV.trim()}` : '.env';

require('dotenv').config({ path: envPath });

const express = require('express');
const Sentry = require('@sentry/node');
const Youch = require('youch');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const mongoConfig = require('./config/database');
const sentryConfig = require('./config/sentry');
const { uploadDir } = require('./config/upload');
const routes = require('./routes');

const { 'not-found': notFoundMiddleware } = require('./app/middlewares');

class App {
  constructor () {
    this.express = express();
    this.isDev = process.env.NODE_ENV !== 'production';

    this.sentry();
    this.database();
    this.middlewares();
    this.routes();
    this.exception();
  }

  sentry () {
    Sentry.init({ dsn: sentryConfig.dns });
  }

  database () {
    mongoose
      .connect(mongoConfig.uri, {
        useCreateIndex: true,
        useNewUrlParser: true,
      })
      .then(() => console.log('database connected'))
      .catch((err) => console.log(err));
  }

  middlewares () {
    this.express.use(helmet());
    this.express.use(compression());
    this.express.use(express.json());
    this.express.use(cors());
    this.express.use(Sentry.Handlers.requestHandler());
  }

  routes () {
    this.express.use('/api/files', express.static(uploadDir));
    this.express.use('/api', routes);
    this.express.use(notFoundMiddleware);
  }

  exception () {
    if (process.env.NODE_ENV === 'production') {
      this.express.use(Sentry.Handlers.errorHandler());
    }

    this.express.use(async (err, req, res) => {
      if (err.status === 400 || err.status === 422) {
        return res.status(err.status).json(err);
      }

      if (process.env.NODE_ENV !== 'production') {
        const youch = new Youch(err);

        return res.status(err.status || 500).json(await youch.toJSON());
      }

      res.status(err.status || 500).json({ error: 'Internal Server Error' });
    });
  }
}

module.exports = new App().express;
