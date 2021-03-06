import { connection as sql } from '../db';
import { Request, Response } from 'express';
import request from 'request';
import _ from 'lodash';

// Config for env variables
let geoKEY = process.env.GEO_API_KEY;

// Returns true if user exists in DB, false if not
export const userExists = async (userId: string) => {
  const sqlQuery = `SELECT * FROM users WHERE BINARY user_id = ${sql.escape(userId)}`;
  let response: any = await sql.query(sqlQuery);
  if (response.length > 0) return true;
  else return false;
};

export const userAuthed = async (userId: string, userToken: string) => {
  if (userToken === '') {
    return false;
  }
  const sqlQuery = `SELECT * from users where BINARY user_id = ${sql.escape(userId)}`;
  let response: any = await sql.query(sqlQuery);
  if (response[0] !== undefined && response[0].user_access_token === userToken) return true;
  else return false;
};

// Checks if a Given ID exists in database (to generate userID)
export const getUniqueId = async (type: string): Promise<string> => {
  const id = generateId(7);
  let sqlQuery = '';
  if (type === 'user') sqlQuery = `SELECT * FROM users WHERE BINARY user_id = ${sql.escape(id)}`;
  let response: any = await sql.query(sqlQuery);
  if (response.length > 0) {
    return getUniqueId(type);
  } else return id;
};

// Convert from base 10 to base 62
export const base62 = (count: number): string => {
  let uniqueId = '';
  let chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

  while (count > 0) {
    uniqueId = chars[count % 62] + uniqueId;
    count = Math.floor(count / 62);
  }

  // Pad with zeroes 7 chars
  while (uniqueId.length < 7) {
    uniqueId = 0 + uniqueId;
  }

  return uniqueId;
};

// Updates local count, and count on server (DB)
export const updateCount = async (req: Request) => {
  // Increment local counter
  let currentCount = req.app.get('currentCount');
  let count = req.app.get('startCount') + currentCount + 1;
  let endCount = req.app.get('startCount') + 1000000;
  req.app.set('currentCount', currentCount + 1);
  let counterURL = req.app.get('counterURL');
  let port = req.app.get('port');

  // Let counter server know we incremented (will insert to DB)
  request.post(`${counterURL}/count?serverPort=${port}&count=${currentCount + 1}`);

  // If we exceeded our count range ask server for new range!
  if (count >= endCount) {
    request(`${counterURL}/newcount?serverPort=${port}`, (err, res, body) => {
      let counts = JSON.parse(body);
      req.app.set('startCount', counts.startCount);
      req.app.set('currentCount', counts.currentCount);
    });
  }
};

// Inserts Analytic Data for current request for given slug
export const setAnalyticData = async (req: Request, slug: string) => {
  // TESTING PURPOSES
  let requestIP = req.ip;
  if (req.ip == '::ffff:127.0.0.1') {
    requestIP = '66.131.255.235';
  }

  // Append ip to geo ip api url
  let geoURL = `https://api.ipgeolocation.io/ipgeo?apiKey=${geoKEY}&ip=`;
  geoURL += requestIP;

  // Call Geolocation API
  request(geoURL, (err, res, body) => {
    let geoAnalytics = formatAnalyticData(body);
    sql.query(`
    INSERT INTO analytics (slug, visit_date, visits, continent, country, state, city)
    VALUES (
    ${sql.escape(slug)}, 
    ${sql.escape(geoAnalytics.date)}, 
    "1", 
    ${sql.escape(geoAnalytics.continent)}, 
    ${sql.escape(geoAnalytics.country)}, 
    ${sql.escape(geoAnalytics.state)}, 
    ${sql.escape(geoAnalytics.city)})
    ON DUPLICATE KEY 
    UPDATE
    visits = visits + 1`);
  });
};

// Generates a hexdecimal 10 character string
export const generateId = (length: number) => {
  let result = '';
  let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

// Gets access token from Http only cookie
export const getAccessToken = (req: Request) => {
  let cookies = req.headers.cookie;
  let accessToken = '';
  if (cookies !== undefined) {
    let str = 'access_token';
    let index = cookies.indexOf('access_token');
    accessToken = cookies.slice(index + str.length + 1, cookies.length);
    return accessToken;
  } else {
    return '';
  }
};

// Formats the Analytic Data and returns as json string
const formatAnalyticData = (body: any) => {
  let reqBody: geoBody = JSON.parse(body);
  let date = new Date();
  let newDate = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();

  let requestLocation = {
    city: reqBody.city,
    state: reqBody.state_prov,
    country: reqBody.country_name,
    continent: reqBody.continent_code,
    date: newDate
  };

  return requestLocation;
};

// Interface for geolocation response data
interface geoBody {
  ip: string;
  continent_code: string;
  country_code2: string;
  country_code3: string;
  country_name: string;
  country_capital: string;
  state_prov: string;
  district: string;
  city: string;
  zipcode: string;
  latitude: string;
  longitude: string;
  is_eu: boolean;
  calling_code: string;
  country_tld: string;
  languages: string;
  country_flag: string;
  geoname_id: string;
  isp: string;
  connection_type: string;
  organization: string;
}

interface analyticData {
  city: string;
  visits: string;
  country: string;
  continent: string;
}
