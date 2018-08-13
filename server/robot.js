const axios = require('axios');
const cheerio = require('cheerio');
const db = require('./db');
const { scheduleJob, write } = require('../util');

// config axios
axios.defaults.headers.get['User-Agent'] =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.84 Safari/537.36';
axios.interceptors.response.use(
  response => {
    return response.data;
  },
  error => {
    return Promise.reject(error);
  }
);

/**
 * @param {any} cycle detail: https://www.npmjs.com/package/node-schedule
 */
class Robot {
  constructor(cycle = { second: 0, minute: 0, hour: 0 }) {
    const prefixUrl = 'https://www.douban.com/group/gz020/discussion?start=';
    this.page = 0;
    this.url = `${prefixUrl + this.page * 25}`;
    this.cycle = cycle;
    this.timer = null;

    // this.fetchData().then(data => {
    //   this.insertToDB(data);
    // });

    this.init();
  }

  // init
  init() {
    // if need delete
    this.handleDelete();

    // everyday at 0:00am
    scheduleJob(this.cycle, () => {
      console.log(`start scheduleJob, time: ${new Date()}`);
      this.page = 0;
      // every 3 second fetch data & write to db
      this.timer = setInterval(() => {
        console.log(`start fetchData, current page: ${this.page}`);
        // only fetch 20 pages
        if (this.page === 20) {
          clearInterval(this.timer);
        }

        this.fetchData().then(data => {
          this.insertToDB(data);
          this.page++;
        });
      }, 3000);
    });
  }

  // fetch data
  fetchData() {
    const that = this;
    return new Promise((resolve, reject) => {
      axios
        .get(that.url)
        .then(res => {
          resolve(that.handleData(res));
        })
        .catch(err => {
          console.error('fetch data error');
          reject(err);
        });
    });
  }

  // transform useful data
  handleData(html) {
    const result = [];
    const $ = cheerio.load(html);
    const $trs = $('table.olt tr');
    $trs.each(function(i) {
      if (i > 0) {
        let line = {};
        const $tds = $(this).children('td');
        $tds.each(function() {
          let $td = $(this);
          // only need `title` & `time` td
          const isTitleTd = $td.hasClass('title');
          const isTimeTd = $td.hasClass('time');
          if (isTitleTd || isTimeTd) {
            // title & url
            if (isTitleTd) {
              const $a = $td.children('a');
              line.title = $a.attr('title');
              line.tid = $a.attr('href').match(/[1-9]\d*/);
            }
            // time
            if (isTimeTd) {
              line.time = $td.text();
            }
          }
        });
        result.push(line);
      }
    });
    return result;
  }

  // write to mongodb
  insertToDB(data) {
    if (data.length) {
      db.Houses.insertMany(data, err => {
        if (err) {
          console.error(`insert db fail, at ${new Date()}：${err.message}`);
        } else {
          console.log(`success insert ${data.length} data at ${new Date()}`);
        }
      });
    }
  }

  // judge if need delete
  handleDelete(maxNum = 5000, delNum = 500) {
    return db.Houses.count() > maxNum ? this.deleteDB(delNum) : false;
  }

  // delete data from db
  deleteDB(num) {
    const ids = [];

    // [{_id:123}, {_id:456}] => [123,456]
    db.Houses.find()
      .sort({ _id: 1 })
      .select('tid')
      .limit(num)
      .exec()
      .then(doc => {
        doc.map(e => {
          ids.push(e.tid);
        });
        db.Houses.remove({ tid: { $in: ids } }, (err, success) => {
          if (err) {
            console.error(err);
          } else {
            console.log(`success delete ${success.n} data at ${new Data()}`);
          }
        });
      });
  }
}

module.exports = Robot;
