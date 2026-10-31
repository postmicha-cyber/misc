// Hilfen für die SonnenPilot-Tests: nachgebauter Wetterdienst, nachgebaute Growatt-Cloud, fester Zeitpunkt.
'use strict';
const H = 3600, DAY = 86400;
const OFF = 3600; // Ortszeit = UTC+1
// Fester Testzeitpunkt: 31.10.2026, 00:00 Ortszeit
const MIDNIGHT = Date.UTC(2026, 9, 31, 0, 0, 0) / 1000 - OFF;
const at = (hour, day = 0) => MIDNIGHT + day * DAY + hour * H;

// Open-Meteo-Antwort im dokumentierten Format (timeformat=unixtime). Strahlung je Stunde: Mittel der VORANGEGANGENEN Stunde.
// days: Liste mit Spitzen-Einstrahlung je Tag in W/m² (Sonne von 8 bis 17 Uhr)
function openMeteo(days = [600, 600, 600, 600], opt = {}) {
  const time = [], gti = [], temp = [], cloud = [], code = [];
  const start = MIDNIGHT - DAY;
  for (let i = 0; i <= days.length * 24; i++) {
    const t = start + i * H, d = Math.floor(i / 24), hMid = (i - 1) % 24 + 0.5; // Stunde davor
    const peak = days[Math.min(d, days.length - 1)] || 0;
    const sun = hMid > (opt.rise || 8) && hMid < (opt.set || 17) ? Math.sin(Math.PI * (hMid - (opt.rise || 8)) / ((opt.set || 17) - (opt.rise || 8))) : 0;
    time.push(t); gti.push(Math.round(peak * sun * 10) / 10); temp.push(9.5); cloud.push(peak > 300 ? 20 : 90); code.push(peak > 300 ? 1 : 3);
  }
  return { latitude: 51.3, longitude: 9.5, utc_offset_seconds: OFF, timezone: 'Europe/Berlin', hourly_units: { time: 'unixtime', global_tilted_irradiance: 'W/m²' }, hourly: { time, global_tilted_irradiance: gti, temperature_2m: temp, cloud_cover: cloud, weather_code: code } };
}

// Nachgebaute Growatt-Cloud. Merkt sich alle Anfragen.
function fakeGrowatt(o = {}) {
  const st = Object.assign({ soc: 60, ppv: 250, pac: 180, charge: 70, discharge: 0, defaultPower: 180, high: 100, low: 10, sessionValid: false, password: 'c98f6bcd4621d373cade4e832627b4f6', setResult: 1 }, o);
  const calls = [];
  const res = (status, body, headers = {}) => ({
    status, ok: status < 400,
    headers: { getSetCookie: () => headers.cookies || [], get: () => null },
    text: async () => typeof body === 'string' ? body : JSON.stringify(body), json: async () => body
  });
  const fetch = async (url, init = {}) => {
    const form = Object.fromEntries(new URLSearchParams(init.body || ''));
    const path = url.replace(/^https:\/\/[^/]+/, '');
    calls.push({ url, path, form, headers: init.headers || {} });
    if (url.includes('evcharge.growatt.com')) return res(200, { code: 0, token: 'tok123' });
    if (path === '/newTwoLoginAPIV2.do') {
      if (form.password !== st.password) return res(200, { back: { success: false, msg: 'Passwort falsch' } });
      st.sessionValid = true;
      return res(200, { back: { success: true, msg: '', user: { id: 4711 } } }, { cookies: ['JSESSIONID=abc; Path=/', 'SERVERID=s1; Path=/'] });
    }
    if (!st.sessionValid || !(init.headers && String(init.headers.Cookie || '').includes('JSESSIONID=abc'))) return res(200, '<html>Bitte anmelden</html>');
    if (path.startsWith('/newTwoPlantAPI.do')) return res(200, { PlantList: [{ id: 111 }, { id: 222 }] });
    if (path === '/noahDeviceApi/noah/isPlantNoahSystem') return res(200, { result: 1, obj: form.plantId === '222' ? { isPlantHaveNoah: true, deviceSn: 'NOAH12345' } : { isPlantHaveNoah: false } });
    if (path === '/noahDeviceApi/noah/getSystemStatus') return res(200, { result: 1, obj: { soc: String(st.soc), ppv: st.ppv + 'Watt', pac: st.pac + 'Watt', chargePower: st.charge + 'Watt', disChargePower: st.discharge + 'Watt', status: '1', batteryNum: '2', workMode: '0', eacToday: '1.2kWh' } });
    if (path === '/noahDeviceApi/noah/getNoahInfoBySn') return res(200, { result: 1, obj: { noah: { defaultPower: String(st.defaultPower), chargingSocHighLimit: String(st.high), chargingSocLowLimit: String(st.low), model: 'NOAH 2000', version: '1.2', batSns: ['B1', 'B2'], time_segment: [{ time_segment1: '0_0:0_23:59_200_1' }] } } });
    if (path === '/noahDeviceApi/noah/set') {
      if (st.setResult !== 1) return res(200, { result: 0, msg: 'Gerät antwortet nicht' });
      if (form.type === 'default_power') st.defaultPower = +form.param1;
      if (form.type === 'charging_soc') { st.high = +form.param1; st.low = +form.param2; }
      return res(200, { result: 1, msg: '' });
    }
    return res(404, 'not found');
  };
  return { fetch, calls, st };
}

module.exports = { H, DAY, OFF, MIDNIGHT, at, openMeteo, fakeGrowatt };
