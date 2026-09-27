import express from 'express';
import fs from 'fs';
import path from 'path';
import net from 'net';
import os from 'os';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const ROOT_DIR = process.cwd();
const SETTING_DIR = path.join(ROOT_DIR, 'setting');
const SYSTEM_INI_PATH = path.join(SETTING_DIR, 'system.ini');
const LOG_CONF_PATH = path.join(SETTING_DIR, 'log.conf');
const RUNTIME_LOG_PATH = path.join(SETTING_DIR, 'runtime.log');
const REPAIR_TICKETS_PATH = path.join(SETTING_DIR, 'repair_tickets.json');

if (!fs.existsSync(SETTING_DIR)) {
  fs.mkdirSync(SETTING_DIR, { recursive: true });
}

export interface SystemIniConfig {
  DebugLogLevel: number;
  DebugLogType: number;
  AccountSel: number;
  AccountName: string;
  AutoScanInterval: number;
  MinerTimeout: number;
  MinerConnections: number;
  UpgradeThreadsSel: number;
  IPSuffixSel: number;
  LangTypeSel: number;
  MinimizeTypeSel: number;
  OnStartupSel: number;
  ListColumnDisplaySel: number;
  ToolOnlineUpdateSel: number;
  AutoExportDataSel: number;
  ProxyPoolUserSel: number;
  AutoAgingSwitchSel: number;
  AutoExportFilePath: string;
  PoolCheck1: number;
  PoolCheck2: number;
  PoolCheck3: number;
  PoolUrl1: string;
  PoolUrl2: string;
  PoolUrl3: string;
  Worker1: string;
  Worker2: string;
  Worker3: string;
  Pwd1: string;
  Pwd2: string;
  Pwd3: string;
  IPCheck1: number;
  IPCheck2: number;
  IPCheck3: number;
  FixedPools: number;
  CoinType: number;
  FirmwareName: string;
}

export interface LogConfConfig {
  enabled: boolean;
  toFile: boolean;
  toStandardOutput: boolean;
  format: string;
  globalFilename: string;
  millisecondsWidth: number;
  performanceTracking: boolean;
  maxLogFileSize: number;
  logFlushThreshold: number;
  errorFilename: string;
  debugFilename: string;
  infoFilename: string;
}

const DEFAULT_SYSTEM_INI: SystemIniConfig = {
  DebugLogLevel: 0,
  DebugLogType: 0,
  AccountSel: 0,
  AccountName: 'admin',
  AutoScanInterval: 30,
  MinerTimeout: 1000,
  MinerConnections: 100,
  UpgradeThreadsSel: 2,
  IPSuffixSel: 2,
  LangTypeSel: 1,
  MinimizeTypeSel: 0,
  OnStartupSel: 0,
  ListColumnDisplaySel: 0,
  ToolOnlineUpdateSel: 1,
  AutoExportDataSel: 0,
  ProxyPoolUserSel: 0,
  AutoAgingSwitchSel: 0,
  AutoExportFilePath: 'setting/whatsminer_report.csv',
  PoolCheck1: 1,
  PoolCheck2: 1,
  PoolCheck3: 1,
  PoolUrl1: '',
  PoolUrl2: '',
  PoolUrl3: '',
  Worker1: '',
  Worker2: '',
  Worker3: '',
  Pwd1: '123',
  Pwd2: '123',
  Pwd3: '123',
  IPCheck1: 1,
  IPCheck2: 1,
  IPCheck3: 1,
  FixedPools: 1,
  CoinType: 0,
  FirmwareName: '',
};

const DEFAULT_LOG_CONF: LogConfConfig = {
  enabled: true,
  toFile: true,
  toStandardOutput: true,
  format: '[%process | %datetime] %msg',
  globalFilename: 'log\\log_%datetime{%Y%M%d}_global.log',
  millisecondsWidth: 3,
  performanceTracking: false,
  maxLogFileSize: 104857600,
  logFlushThreshold: 0,
  errorFilename: 'log\\log_%datetime{%Y%M%d}_error.log',
  debugFilename: 'log\\log_%datetime{%Y%M%d}_debug.log',
  infoFilename: 'log\\log_%datetime{%Y%M%d}_info.log',
};

function parseSystemIni(raw: string): SystemIniConfig {
  const cfg: Record<string, string | number> = { ...DEFAULT_SYSTEM_INI };
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('[') || trimmed.startsWith(';') || trimmed.startsWith('#')) {
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key in cfg) {
      if (typeof DEFAULT_SYSTEM_INI[key as keyof SystemIniConfig] === 'number') {
        const num = Number(val);
        cfg[key] = Number.isNaN(num) ? 0 : num;
      } else {
        cfg[key] = val;
      }
    }
  }
  return cfg as unknown as SystemIniConfig;
}

function serializeSystemIni(cfg: SystemIniConfig): string {
  return [
    '[TOOL]',
    `DebugLogLevel=${cfg.DebugLogLevel}`,
    `DebugLogType=${cfg.DebugLogType}`,
    '[SETTING]',
    `AccountSel=${cfg.AccountSel}`,
    `AccountName=${cfg.AccountName}`,
    `AutoScanInterval=${cfg.AutoScanInterval}`,
    `MinerTimeout=${cfg.MinerTimeout}`,
    `MinerConnections=${cfg.MinerConnections}`,
    `UpgradeThreadsSel=${cfg.UpgradeThreadsSel}`,
    `IPSuffixSel=${cfg.IPSuffixSel}`,
    `LangTypeSel=${cfg.LangTypeSel}`,
    `MinimizeTypeSel=${cfg.MinimizeTypeSel}`,
    `OnStartupSel=${cfg.OnStartupSel}`,
    `ListColumnDisplaySel=${cfg.ListColumnDisplaySel}`,
    `ToolOnlineUpdateSel=${cfg.ToolOnlineUpdateSel}`,
    `AutoExportDataSel=${cfg.AutoExportDataSel}`,
    `ProxyPoolUserSel=${cfg.ProxyPoolUserSel}`,
    `AutoAgingSwitchSel=${cfg.AutoAgingSwitchSel}`,
    `AutoExportFilePath=${cfg.AutoExportFilePath}`,
    '[POOLS]',
    `PoolCheck1=${cfg.PoolCheck1}`,
    `PoolCheck2=${cfg.PoolCheck2}`,
    `PoolCheck3=${cfg.PoolCheck3}`,
    `PoolUrl1=${cfg.PoolUrl1}`,
    `PoolUrl2=${cfg.PoolUrl2}`,
    `PoolUrl3=${cfg.PoolUrl3}`,
    `Worker1=${cfg.Worker1}`,
    `Worker2=${cfg.Worker2}`,
    `Worker3=${cfg.Worker3}`,
    `Pwd1=${cfg.Pwd1}`,
    `Pwd2=${cfg.Pwd2}`,
    `Pwd3=${cfg.Pwd3}`,
    `IPCheck1=${cfg.IPCheck1}`,
    `IPCheck2=${cfg.IPCheck2}`,
    `IPCheck3=${cfg.IPCheck3}`,
    `FixedPools=${cfg.FixedPools}`,
    `CoinType=${cfg.CoinType}`,
    '[FIRMWARE]',
    `FirmwareName=${cfg.FirmwareName}`,
    '',
  ].join('\n');
}

function parseLogConf(raw: string): LogConfConfig {
  const cfg = { ...DEFAULT_LOG_CONF };
  let currentSection = 'GLOBAL';
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('*')) {
      currentSection = trimmed.replace('*', '').replace(':', '').trim().toUpperCase();
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim().toUpperCase();
    const rawVal = trimmed.slice(eqIdx + 1).trim().replace(/^"|"$/g, '');
    if (currentSection === 'GLOBAL') {
      if (key === 'ENABLED') cfg.enabled = rawVal === 'true';
      if (key === 'TO_FILE') cfg.toFile = rawVal === 'true';
      if (key === 'TO_STANDARD_OUTPUT') cfg.toStandardOutput = rawVal === 'true';
      if (key === 'FORMAT') cfg.format = rawVal;
      if (key === 'FILENAME') cfg.globalFilename = rawVal;
      if (key === 'MILLISECONDS_WIDTH') cfg.millisecondsWidth = Number(rawVal) || 3;
      if (key === 'PERFORMANCE_TRACKING') cfg.performanceTracking = rawVal === 'true';
      if (key === 'MAX_LOG_FILE_SIZE') cfg.maxLogFileSize = Number(rawVal) || 104857600;
      if (key === 'LOG_FLUSH_THRESHOLD') cfg.logFlushThreshold = Number(rawVal) || 0;
    } else if (currentSection === 'ERROR' && key === 'FILENAME') {
      cfg.errorFilename = rawVal;
    } else if (currentSection === 'DEBUG' && key === 'FILENAME') {
      cfg.debugFilename = rawVal;
    } else if (currentSection === 'INFO' && key === 'FILENAME') {
      cfg.infoFilename = rawVal;
    }
  }
  return cfg;
}

function serializeLogConf(cfg: LogConfConfig): string {
  return [
    '* GLOBAL:',
    `    ENABLED                 =   ${cfg.enabled}`,
    `    TO_FILE                 =   ${cfg.toFile}`,
    `    TO_STANDARD_OUTPUT      =   ${cfg.toStandardOutput}`,
    `    FORMAT                  =   "${cfg.format}"`,
    `    FILENAME                =   "${cfg.globalFilename}"`,
    `    MILLISECONDS_WIDTH      =   ${cfg.millisecondsWidth}`,
    `    PERFORMANCE_TRACKING    =   ${cfg.performanceTracking}`,
    `    MAX_LOG_FILE_SIZE       =   ${cfg.maxLogFileSize}`,
    `    LOG_FLUSH_THRESHOLD     =   ${cfg.logFlushThreshold}`,
    '* ERROR:',
    `    FILENAME                =   "${cfg.errorFilename}"`,
    '* DEBUG:',
    `    FILENAME                =   "${cfg.debugFilename}"`,
    '* INFO:',
    `    FILENAME                =   "${cfg.infoFilename}"`,
    '',
  ].join('\n');
}

function readConfigFromDisk() {
  const sysRaw = fs.existsSync(SYSTEM_INI_PATH)
    ? fs.readFileSync(SYSTEM_INI_PATH, 'utf-8')
    : serializeSystemIni(DEFAULT_SYSTEM_INI);
  const logRaw = fs.existsSync(LOG_CONF_PATH)
    ? fs.readFileSync(LOG_CONF_PATH, 'utf-8')
    : serializeLogConf(DEFAULT_LOG_CONF);
  return {
    systemIni: parseSystemIni(sysRaw),
    rawSystemIni: sysRaw,
    logConf: parseLogConf(logRaw),
    rawLogConf: logRaw,
  };
}

function appendRuntimeLog(level: 'GLOBAL' | 'INFO' | 'DEBUG' | 'ERROR', processName: string, message: string) {
  const { logConf } = readConfigFromDisk();
  if (!logConf.enabled) return;

  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`;

  const formatted = logConf.format
    .replace('%process', processName)
    .replace('%datetime', timestamp)
    .replace('%msg', message);

  const record = JSON.stringify({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp,
    level,
    process: processName,
    message,
    formatted,
  });

  try {
    fs.appendFileSync(RUNTIME_LOG_PATH, record + '\n', 'utf-8');
  } catch {
    // ignore
  }
}

// ============================================================================
// OFFICIAL WHATSMINER MD5-CRYPT ($1$salt$) + AES-256-ECB ENCRYPTION FOR WRITE API
// Reference: WhatsMiner API Document (get_token -> MD5 crypt -> AES-256-ECB)
// ============================================================================
const MD5_ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function to64(v: number, n: number): string {
  let ret = '';
  let val = v;
  let count = n;
  while (--count >= 0) {
    ret += MD5_ITOA64[val & 0x3f];
    val >>>= 6;
  }
  return ret;
}

function md5CryptWhatsMiner(password: string, salt: string): string {
  const cleanSalt = salt.slice(0, 8);
  const magic = '$1$';

  const ctx = crypto.createHash('md5');
  ctx.update(password + magic + cleanSalt);

  const altCtx = crypto.createHash('md5');
  altCtx.update(password + cleanSalt + password);
  let final = altCtx.digest();

  for (let pl = password.length; pl > 0; pl -= 16) {
    ctx.update(final.subarray(0, pl > 16 ? 16 : pl));
  }

  for (let i = password.length; i !== 0; i >>>= 1) {
    if (i & 1) {
      ctx.update(Buffer.from([0]));
    } else {
      ctx.update(password[0]);
    }
  }

  final = ctx.digest();

  for (let i = 0; i < 1000; i++) {
    const loopCtx = crypto.createHash('md5');
    if (i & 1) loopCtx.update(password);
    else loopCtx.update(final);

    if (i % 3 !== 0) loopCtx.update(cleanSalt);
    if (i % 7 !== 0) loopCtx.update(password);

    if (i & 1) loopCtx.update(final);
    else loopCtx.update(password);

    final = loopCtx.digest();
  }

  const passwd =
    to64((final[0] << 16) | (final[6] << 8) | final[12], 4) +
    to64((final[1] << 16) | (final[7] << 8) | final[13], 4) +
    to64((final[2] << 16) | (final[8] << 8) | final[14], 4) +
    to64((final[3] << 16) | (final[9] << 8) | final[15], 4) +
    to64((final[4] << 16) | (final[10] << 8) | final[5], 4) +
    to64(final[11], 2);

  return passwd;
}

function aes256EcbEncrypt(plainText: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  // Pad with null bytes to multiple of 16 bytes (WhatsMiner C daemon convention)
  const rawBuf = Buffer.from(plainText, 'utf-8');
  const padLen = (16 - (rawBuf.length % 16)) % 16;
  const padded = padLen > 0 ? Buffer.concat([rawBuf, Buffer.alloc(padLen, 0)]) : rawBuf;

  const cipher = crypto.createCipheriv('aes-256-ecb', key, null);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return encrypted.toString('base64');
}

function aes256EcbDecrypt(cipherBase64: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherBase64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf-8').replace(/\0+$/g, '').trim();
}

// ============================================================================
// REAL TCP SOCKET CLIENT FOR WHATSMINER / BTMINER / CGMINER PORT 4028
// ============================================================================
function sendMinerTcpCommand(
  host: string,
  port: number,
  payload: Record<string, unknown>,
  timeoutMs = 1500
): Promise<{ raw: string; parsed: any; latencyMs: number }> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    const chunks: Buffer[] = [];
    let settled = false;

    const finalize = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) {
        reject(err);
        return;
      }
      const latencyMs = Date.now() - startTime;
      const raw = Buffer.concat(chunks)
        .toString('utf-8')
        .replace(/\0+$/g, '')
        .trim();
      if (!raw) {
        reject(new Error(`Empty response from ${host}:${port}`));
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve({ raw, parsed, latencyMs });
      } catch {
        resolve({ raw, parsed: { rawText: raw }, latencyMs });
      }
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      socket.write(JSON.stringify(payload));
    });

    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      const str = Buffer.concat(chunks).toString('utf-8').replace(/\0+$/g, '').trim();
      if (str.endsWith('}')) {
        finalize();
      }
    });

    socket.on('end', () => finalize());
    socket.on('close', () => {
      if (!settled) {
        if (chunks.length > 0) finalize();
        else finalize(new Error(`Connection closed by ${host}:${port}`));
      }
    });
    socket.on('timeout', () =>
      finalize(new Error(`TCP timeout (${timeoutMs}ms) connecting to ${host}:${port}`))
    );
    socket.on('error', (err) => finalize(err));

    socket.connect(port, host);
  });
}

// Execute encrypted WhatsMiner write command using official get_token flow
async function sendAuthenticatedMinerCommand(
  host: string,
  port: number,
  payload: Record<string, unknown>,
  adminPassword: string,
  timeoutMs = 2000
): Promise<{ raw: string; parsed: any; latencyMs: number; usedEncryption: boolean }> {
  // First attempt plain command; if miner returns Code 45 / STATUS E (requires encryption) or if password is provided for write cmd, use get_token
  const readOnlyCmds = new Set([
    'summary',
    'edevs',
    'devs',
    'pools',
    'status',
    'get_version',
    'get_psu',
    'get_miner_info',
    'get_error_code',
    'get_token',
  ]);
  const cmdName = String(payload.cmd || payload.command || '').toLowerCase();

  if (readOnlyCmds.has(cmdName)) {
    const res = await sendMinerTcpCommand(host, port, payload, timeoutMs);
    return { ...res, usedEncryption: false };
  }

  // Try getting token from real miner for encrypted command
  try {
    const tokenRes = await sendMinerTcpCommand(host, port, { cmd: 'get_token' }, timeoutMs);
    const msg = tokenRes.parsed?.Msg;
    if (msg && typeof msg === 'object' && msg.salt && msg.newsalt && msg.time) {
      const pwdCrypt = md5CryptWhatsMiner(adminPassword || 'admin', String(msg.salt));
      const aesKeyHex = crypto.createHash('sha256').update(pwdCrypt).digest('hex');
      const signStr = md5CryptWhatsMiner(pwdCrypt + String(msg.time), String(msg.newsalt));

      const signedPayload = {
        ...payload,
        token: signStr,
      };
      const encBase64 = aes256EcbEncrypt(JSON.stringify(signedPayload), aesKeyHex);
      const encRes = await sendMinerTcpCommand(
        host,
        port,
        { enc: 1, data: encBase64 },
        timeoutMs
      );
      if (encRes.parsed?.enc && typeof encRes.parsed.enc === 'string') {
        const decStr = aes256EcbDecrypt(encRes.parsed.enc, aesKeyHex);
        try {
          return {
            raw: decStr,
            parsed: JSON.parse(decStr),
            latencyMs: tokenRes.latencyMs + encRes.latencyMs,
            usedEncryption: true,
          };
        } catch {
          return {
            raw: decStr,
            parsed: { rawText: decStr },
            latencyMs: tokenRes.latencyMs + encRes.latencyMs,
            usedEncryption: true,
          };
        }
      }
      return { ...encRes, usedEncryption: true };
    }
  } catch {
    // Fall back to direct unencrypted command if get_token is not required
  }

  const directRes = await sendMinerTcpCommand(host, port, payload, timeoutMs);
  return { ...directRes, usedEncryption: false };
}

// ============================================================================
// STRICT 100% REAL TELEMETRY PARSER (NO SYNTHETIC FALLBACK VALUES)
// Extracts ONLY exact values reported by the miner's API responses
// ============================================================================
export function parseExactMinerTelemetry(
  ip: string,
  port: number,
  latencyMs: number,
  packets: {
    summary?: any;
    edevs?: any;
    devs?: any;
    pools?: any;
    psu?: any;
    errorCode?: any;
    minerInfo?: any;
    version?: any;
    status?: any;
  }
) {
  const summaryObj =
    packets.summary?.SUMMARY?.[0] ||
    packets.summary?.Msg?.[0] ||
    packets.summary?.Msg ||
    packets.summary ||
    {};

  const rawDevsList: any[] =
    packets.edevs?.DEVS ||
    (Array.isArray(packets.edevs?.Msg) ? packets.edevs.Msg : null) ||
    packets.devs?.DEVS ||
    (Array.isArray(packets.devs?.Msg) ? packets.devs.Msg : null) ||
    [];

  const rawPoolsList: any[] =
    packets.pools?.POOLS ||
    (Array.isArray(packets.pools?.Msg) ? packets.pools.Msg : null) ||
    [];

  const psuObj: any =
    packets.psu?.Msg && typeof packets.psu.Msg === 'object'
      ? packets.psu.Msg
      : packets.psu?.PSU || {};

  const errObj: any =
    packets.errorCode?.Msg && typeof packets.errorCode.Msg === 'object'
      ? packets.errorCode.Msg
      : packets.errorCode || {};

  const infoObj: any =
    packets.minerInfo?.Msg && typeof packets.minerInfo.Msg === 'object'
      ? packets.minerInfo.Msg
      : packets.minerInfo || {};

  const verObj: any =
    packets.version?.Msg && typeof packets.version.Msg === 'object'
      ? packets.version.Msg
      : packets.version || {};

  const statusObj: any =
    packets.status?.Msg && typeof packets.status.Msg === 'object'
      ? packets.status.Msg
      : packets.status || {};

  const toNumOrNull = (val: unknown): number | null => {
    if (val === undefined || val === null || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  };

  // Real Hashrate (BTMiner reports MH/s in 'HS RT', 'MHS 5s', 'MHS av', 'MHS 1m', 'MHS 5m', 'MHS 15m')
  const mhsRt = toNumOrNull(summaryObj['HS RT'] ?? summaryObj['MHS 5s']);
  const mhsAvg = toNumOrNull(summaryObj['MHS av']);
  const mhs1m = toNumOrNull(summaryObj['MHS 1m']);
  const mhs5m = toNumOrNull(summaryObj['MHS 5m']);
  const mhs15m = toNumOrNull(summaryObj['MHS 15m']);
  const factoryGhs = toNumOrNull(summaryObj['Factory GHS']);

  const hashrateRtTh = mhsRt !== null ? Number((mhsRt / 1_000_000).toFixed(2)) : null;
  const hashrateAvgTh = mhsAvg !== null ? Number((mhsAvg / 1_000_000).toFixed(2)) : null;

  const powerW = toNumOrNull(summaryObj['Power'] ?? summaryObj['Power_RT'] ?? psuObj.pin);
  const powerRateJTh =
    toNumOrNull(summaryObj['Power Rate']) ??
    (powerW !== null && hashrateRtTh !== null && hashrateRtTh > 0
      ? Number((powerW / hashrateRtTh).toFixed(2))
      : null);

  const fanIn = toNumOrNull(summaryObj['Fan Speed In']);
  const fanOut = toNumOrNull(summaryObj['Fan Speed Out']);
  const envTemp = toNumOrNull(summaryObj['Env Temp']);
  const pcbTempMax = toNumOrNull(summaryObj['Temperature']);
  const chipTempMin = toNumOrNull(summaryObj['Chip Temp Min']);
  const chipTempAvg = toNumOrNull(summaryObj['Chip Temp Avg']);
  const chipTempMax = toNumOrNull(summaryObj['Chip Temp Max']);
  const freqAvg = toNumOrNull(summaryObj['freq_avg']);
  const targetFreq = toNumOrNull(summaryObj['Target Freq']);
  const upfreqComplete = toNumOrNull(summaryObj['Upfreq Complete']);
  const elapsedSec = toNumOrNull(summaryObj['Elapsed']);
  const accepted = toNumOrNull(summaryObj['Accepted']);
  const rejected = toNumOrNull(summaryObj['Rejected']);
  const stale = toNumOrNull(summaryObj['Stale']);
  const hwErrors = toNumOrNull(summaryObj['Hardware Errors']);
  const rejectRate =
    toNumOrNull(summaryObj['Pool Rejected%']) ??
    (accepted !== null && rejected !== null && accepted + rejected > 0
      ? Number(((rejected / (accepted + rejected)) * 100).toFixed(2))
      : null);

  // Active Error Codes reported by get_error_code or summary
  const errorCodes: { code: string; reason: string; timestamp?: string }[] = [];
  if (Array.isArray(errObj?.error_code)) {
    for (const item of errObj.error_code) {
      if (typeof item === 'object' && item !== null) {
        for (const [k, v] of Object.entries(item)) {
          if (k && k !== '0') {
            errorCodes.push({ code: String(k), timestamp: String(v), reason: `Reported by get_error_code` });
          }
        }
      } else if (item && String(item) !== '0') {
        errorCodes.push({ code: String(item), reason: 'Reported by get_error_code' });
      }
    }
  }
  const summaryErrCount = toNumOrNull(summaryObj['Error Code Count']);
  if (summaryErrCount && summaryErrCount > 0) {
    for (let i = 0; i < summaryErrCount; i++) {
      const codeVal = summaryObj[`Error Code ${i}`];
      if (codeVal && !errorCodes.some((e) => e.code === String(codeVal))) {
        errorCodes.push({ code: String(codeVal), reason: `Summary Error Code ${i}` });
      }
    }
  }

  // Exact Hashboard Slots from edevs / devs
  const hashboards = rawDevsList.map((d: any, idx: number) => {
    const slotId = toNumOrNull(d.ASC ?? d.Slot) ?? idx;
    const boardMhsAvg = toNumOrNull(d['MHS av']);
    const boardMhsRt = toNumOrNull(d['HS RT'] ?? d['MHS 5s'] ?? d['MHS av']);
    const boardThRt = boardMhsRt !== null ? Number((boardMhsRt / 1_000_000).toFixed(2)) : null;
    const boardThAvg = boardMhsAvg !== null ? Number((boardMhsAvg / 1_000_000).toFixed(2)) : null;

    return {
      slot: slotId,
      status: String(d.Status ?? d.Enabled ?? ''),
      model: String(d.Model ?? d.Name ?? `SM${slotId}`),
      hashrateRtTh: boardThRt,
      hashrateAvgTh: boardThAvg,
      mhsAv: boardMhsAvg,
      hsRt: boardMhsRt,
      pcbTemp: toNumOrNull(d['Temperature'] ?? d['PCB Temp']),
      chipTempMin: toNumOrNull(d['Chip Temp Min']),
      chipTempMax: toNumOrNull(d['Chip Temp Max']),
      chipTempAvg: toNumOrNull(d['Chip Temp Avg']),
      freqMhz: toNumOrNull(d['Chip Frequency'] ?? d['freq']),
      effectiveChips: toNumOrNull(d['Effective Chips'] ?? d['Chips']),
      totalChips: toNumOrNull(d['Total Chips']),
      hardwareErrors: toNumOrNull(d['Hardware Errors']),
      crcErrors: toNumOrNull(d['Combo CRC'] ?? d['CRC Errors']),
      voltageMv: toNumOrNull(d['Chip Vol'] ?? d['Domain Voltage']),
      serialNo: String(d['PCB SN'] ?? d['SN'] ?? ''),
      chipType: String(d['Chip Type'] ?? verObj.chip ?? ''),
      upfreqComplete: toNumOrNull(d['Upfreq Complete']),
      rawFields: d,
    };
  });

  // Exact Pools from pools
  const pools = rawPoolsList.map((p: any, idx: number) => ({
    index: toNumOrNull(p.POOL) ?? idx,
    url: String(p.URL ?? ''),
    user: String(p.User ?? ''),
    status: String(p.Status ?? ''),
    priority: toNumOrNull(p.Priority) ?? idx,
    accepted: toNumOrNull(p.Accepted),
    rejected: toNumOrNull(p.Rejected),
    stale: toNumOrNull(p.Stale),
    stratumActive: Boolean(p['Stratum Active']),
    lastShareTime: String(p['Last Share Time'] ?? ''),
  }));

  // Exact PSU from get_psu
  const hasPsuData = Object.keys(psuObj).length > 0;
  const psu = hasPsuData
    ? {
        model: String(psuObj.model ?? psuObj.name ?? ''),
        vendor: String(psuObj.vendor ?? ''),
        serialNo: String(psuObj.serial_no ?? ''),
        version: String(psuObj.version ?? ''),
        vin: toNumOrNull(psuObj.vin),
        voutMv: toNumOrNull(psuObj.vout),
        ioutA: toNumOrNull(psuObj.iout),
        pinW: toNumOrNull(psuObj.pin),
        fanRpm: toNumOrNull(psuObj.fan_speed),
        temp0: toNumOrNull(psuObj.temp0),
        temp1: toNumOrNull(psuObj.temp1),
        temp2: toNumOrNull(psuObj.temp2),
        errorCode: String(psuObj.error_code ?? ''),
        rawFields: psuObj,
      }
    : null;

  const btminerStatus = String(statusObj.btmineroff ?? '');
  const isMining = (hashrateRtTh !== null && hashrateRtTh > 0) || btminerStatus === 'false';
  const status =
    errorCodes.length > 0
      ? 'Warning'
      : isMining
      ? 'Mining'
      : 'Offline';

  return {
    id: `${ip}:${port}`,
    ip,
    port,
    latencyMs,
    probedAt: new Date().toISOString(),
    mac: String(infoObj.mac ?? summaryObj['MAC'] ?? ''),
    hostname: String(infoObj.hostname ?? ''),
    model: String(infoObj.minertype ?? summaryObj['Type'] ?? verObj.minertype ?? ''),
    controlBoard: String(infoObj.platform ?? verObj.platform ?? summaryObj['CB Platform'] ?? ''),
    firmware: String(
      infoObj.fw_version ?? verObj.fw_version ?? summaryObj['Firmware Version'] ?? ''
    ),
    apiVersion: String(verObj.api_ver ?? ''),
    serialNo: String(infoObj.minersn ?? ''),
    ledFlashing: infoObj.led === 'flash',
    securityMode: toNumOrNull(summaryObj['Security Mode']),
    liquidCooling: toNumOrNull(summaryObj['Liquid Cooling']),
    status,
    hashrateRtTh,
    hashrateAvgTh,
    mhsRt,
    mhsAvg,
    mhs1m,
    mhs5m,
    mhs15m,
    factoryGhs,
    powerW,
    powerRateJTh,
    powerMode: String(summaryObj['Power Mode'] ?? ''),
    freqAvg,
    targetFreq,
    upfreqComplete,
    fanIn,
    fanOut,
    envTemp,
    pcbTempMax,
    chipTempMin,
    chipTempAvg,
    chipTempMax,
    rejectRate,
    accepted,
    rejected,
    stale,
    hwErrors,
    elapsedSec,
    errorCodes,
    hashboards,
    pools,
    psu,
    rawPackets: packets,
  };
}

// Probe a single real IP:Port over TCP
async function probeSingleMiner(ip: string, port: number, timeoutMs: number) {
  const summaryRes = await sendMinerTcpCommand(ip, port, { cmd: 'summary' }, timeoutMs);
  const latencyMs = summaryRes.latencyMs;

  const [edevsRes, devsRes, poolsRes, psuRes, errRes, infoRes, verRes, statusRes] =
    await Promise.allSettled([
      sendMinerTcpCommand(ip, port, { cmd: 'edevs' }, timeoutMs),
      sendMinerTcpCommand(ip, port, { cmd: 'devs' }, timeoutMs),
      sendMinerTcpCommand(ip, port, { cmd: 'pools' }, timeoutMs),
      sendMinerTcpCommand(ip, port, { cmd: 'get_psu' }, timeoutMs),
      sendMinerTcpCommand(ip, port, { cmd: 'get_error_code' }, timeoutMs),
      sendMinerTcpCommand(ip, port, { cmd: 'get_miner_info' }, timeoutMs),
      sendMinerTcpCommand(ip, port, { cmd: 'get_version' }, timeoutMs),
      sendMinerTcpCommand(ip, port, { cmd: 'status' }, timeoutMs),
    ]);

  return parseExactMinerTelemetry(ip, port, latencyMs, {
    summary: summaryRes.parsed,
    edevs: edevsRes.status === 'fulfilled' ? edevsRes.value.parsed : undefined,
    devs: devsRes.status === 'fulfilled' ? devsRes.value.parsed : undefined,
    pools: poolsRes.status === 'fulfilled' ? poolsRes.value.parsed : undefined,
    psu: psuRes.status === 'fulfilled' ? psuRes.value.parsed : undefined,
    errorCode: errRes.status === 'fulfilled' ? errRes.value.parsed : undefined,
    minerInfo: infoRes.status === 'fulfilled' ? infoRes.value.parsed : undefined,
    version: verRes.status === 'fulfilled' ? verRes.value.parsed : undefined,
    status: statusRes.status === 'fulfilled' ? statusRes.value.parsed : undefined,
  });
}

function expandIpRange(startIp: string, endIp: string): string[] {
  const sParts = startIp.trim().split('.').map(Number);
  const eParts = endIp.trim().split('.').map(Number);
  if (sParts.length !== 4 || eParts.length !== 4) return [startIp.trim()];
  if (sParts.some(Number.isNaN) || eParts.some(Number.isNaN)) return [startIp.trim()];

  if (sParts[0] === eParts[0] && sParts[1] === eParts[1] && sParts[2] === eParts[2]) {
    const startHost = Math.max(1, Math.min(sParts[3], eParts[3]));
    const endHost = Math.min(254, Math.max(sParts[3], eParts[3]));
    const list: string[] = [];
    for (let h = startHost; h <= endHost && list.length <= 254; h++) {
      list.push(`${sParts[0]}.${sParts[1]}.${sParts[2]}.${h}`);
    }
    return list;
  }
  return [startIp.trim()];
}

async function startServer() {
  appendRuntimeLog(
    'GLOBAL',
    'WhatsMinerToolServer',
    'Initialized real TCP 4028 backend (zero mock data; MD5/AES-256-ECB get_token authentication active).'
  );

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // 0. Detect host network interfaces so technician can see local LAN subnets
  app.get('/api/network/interfaces', (_req, res) => {
    const nets = os.networkInterfaces();
    const list: { name: string; address: string; netmask: string; cidr: string; suggestedStart: string; suggestedEnd: string }[] = [];
    for (const [name, addrs] of Object.entries(nets)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          const parts = addr.address.split('.');
          const prefix = parts.slice(0, 3).join('.');
          list.push({
            name,
            address: addr.address,
            netmask: addr.netmask,
            cidr: addr.cidr || `${addr.address}/24`,
            suggestedStart: `${prefix}.1`,
            suggestedEnd: `${prefix}.254`,
          });
        }
      }
    }
    res.json({ interfaces: list });
  });

  // 1. Read real /setting/system.ini and /setting/log.conf from disk
  app.get('/api/config', (_req, res) => {
    try {
      res.json(readConfigFromDisk());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Write real /setting/system.ini and /setting/log.conf to disk
  app.put('/api/config', (req, res) => {
    try {
      const { systemIni, logConf } = req.body;
      if (systemIni) {
        fs.writeFileSync(SYSTEM_INI_PATH, serializeSystemIni(systemIni), 'utf-8');
      }
      if (logConf) {
        fs.writeFileSync(LOG_CONF_PATH, serializeLogConf(logConf), 'utf-8');
      }
      appendRuntimeLog('INFO', 'ConfigManager', 'Updated setting/system.ini & setting/log.conf on disk.');
      res.json(readConfigFromDisk());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Probe a single miner IP:Port over real TCP socket
  app.post('/api/miner/probe', async (req, res) => {
    const ip = String(req.body.ip || '').trim();
    const port = Number(req.body.port || 4028);
    if (!ip) {
      res.status(400).json({ ok: false, error: 'IP address is required' });
      return;
    }
    const { systemIni } = readConfigFromDisk();
    const timeoutMs = Number(req.body.timeoutMs || systemIni.MinerTimeout || 1500);

    try {
      const telemetry = await probeSingleMiner(ip, port, timeoutMs);
      appendRuntimeLog(
        'INFO',
        'TCPProbe',
        `Connected to ${ip}:${port} (${telemetry.latencyMs}ms) — RT=${telemetry.hashrateRtTh ?? 'N/A'} TH/s`
      );
      res.json({ ok: true, miner: telemetry });
    } catch (err: any) {
      appendRuntimeLog('ERROR', 'TCPProbe', `No response from ${ip}:${port} — ${err.message}`);
      res.status(502).json({ ok: false, error: err.message, ip, port });
    }
  });

  // 4. Scan an IP range or list of targets over real TCP sockets
  app.post('/api/miner/scan', async (req, res) => {
    const { targets, startIp, endIp, port = 4028 } = req.body;
    const { systemIni } = readConfigFromDisk();
    const timeoutMs = Math.min(4000, Math.max(300, Number(systemIni.MinerTimeout || 1000)));
    const concurrency = Math.min(100, Math.max(5, Number(systemIni.MinerConnections || 50)));

    let hostPortList: { ip: string; port: number }[] = [];
    if (Array.isArray(targets) && targets.length > 0) {
      hostPortList = targets.map((t: any) => ({
        ip: String(t.ip || '').trim(),
        port: Number(t.port || port || 4028),
      })).filter((t) => Boolean(t.ip));
    } else if (startIp && endIp) {
      const ips = expandIpRange(String(startIp), String(endIp));
      hostPortList = ips.map((ip) => ({ ip, port: Number(port || 4028) }));
    }

    appendRuntimeLog(
      'INFO',
      'ScannerEngine',
      `Scanning ${hostPortList.length} IP address(es) on TCP port ${port} (timeout=${timeoutMs}ms, concurrency=${concurrency})...`
    );

    const discovered: any[] = [];
    const failed: { ip: string; port: number; reason: string }[] = [];

    for (let i = 0; i < hostPortList.length; i += concurrency) {
      const batch = hostPortList.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map((target) => probeSingleMiner(target.ip, target.port, timeoutMs))
      );
      results.forEach((r, idx) => {
        const target = batch[idx];
        if (r.status === 'fulfilled') {
          discovered.push(r.value);
        } else {
          failed.push({
            ip: target.ip,
            port: target.port,
            reason: r.reason?.message || 'Connection refused / timeout',
          });
        }
      });
    }

    appendRuntimeLog(
      'INFO',
      'ScannerEngine',
      `Scan finished: ${discovered.length} online miner(s) responded out of ${hostPortList.length} probed.`
    );

    res.json({
      ok: true,
      probedCount: hostPortList.length,
      onlineCount: discovered.length,
      miners: discovered,
      failed: failed.slice(0, 50),
    });
  });

  // 5. Send raw or authenticated write command to a miner over TCP 4028
  app.post('/api/miner/command', async (req, res) => {
    const { ip, port = 4028, payload, adminPassword = 'admin' } = req.body;
    if (!ip) {
      res.status(400).json({ ok: false, error: 'Target IP is required' });
      return;
    }
    const { systemIni } = readConfigFromDisk();
    const timeoutMs = Math.max(1200, Number(systemIni.MinerTimeout || 1500));

    try {
      const cmdPayload =
        typeof payload === 'string' ? JSON.parse(payload) : payload || { cmd: 'summary' };
      const result = await sendAuthenticatedMinerCommand(
        String(ip).trim(),
        Number(port),
        cmdPayload,
        String(adminPassword || 'admin'),
        timeoutMs
      );
      appendRuntimeLog(
        'DEBUG',
        'APIConsole',
        `Command ${JSON.stringify(cmdPayload)} -> ${ip}:${port} (${result.latencyMs}ms, encrypted=${result.usedEncryption})`
      );
      res.json({
        ok: true,
        ip,
        port,
        latencyMs: result.latencyMs,
        usedEncryption: result.usedEncryption,
        raw: result.raw,
        parsed: result.parsed,
      });
    } catch (err: any) {
      appendRuntimeLog('ERROR', 'APIConsole', `Command failed on ${ip}:${port} — ${err.message}`);
      res.status(502).json({ ok: false, error: err.message });
    }
  });

  // 6. Parse raw UART / SSH / API JSON log pasted by a technician from a physical test bench
  app.post('/api/miner/parse-raw', (req, res) => {
    try {
      const { rawText, label = 'UART/Bench-Input' } = req.body;
      if (!rawText || typeof rawText !== 'string') {
        res.status(400).json({ ok: false, error: 'Raw text or JSON is required' });
        return;
      }

      const trimmed = rawText.trim();
      let packets: Record<string, any> = {};

      if (trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        if (parsed.SUMMARY) packets.summary = parsed;
        if (parsed.DEVS) packets.edevs = parsed;
        if (parsed.POOLS) packets.pools = parsed;
        if (parsed.PSU || parsed.Msg?.vin !== undefined) packets.psu = parsed;
        if (parsed.rawPackets) packets = parsed.rawPackets;
        if (Object.keys(packets).length === 0) {
          packets.summary = parsed;
        }
      } else {
        // Parse real WhatsMiner UART / btminer.log lines (e.g. Slot0/SM0 chip count, freq, temp, error codes)
        const lines = trimmed.split(/\r?\n/);
        const devs: any[] = [];
        const errors: any[] = [];
        let power: number | undefined;
        let vin: number | undefined;
        let vout: number | undefined;

        for (const line of lines) {
          // Match SM0/SM1/SM2 or slot0/slot1/slot2 chip detection lines from real btminer log
          const slotMatch = line.match(/(?:SM|slot|chain)\s*([0-2]).*?(?:chips|effective|asic)[:=\s]+(\d+)/i);
          if (slotMatch) {
            const slotIdx = Number(slotMatch[1]);
            const chips = Number(slotMatch[2]);
            const freqMatch = line.match(/freq[:=\s]+(\d+)/i);
            const tempMatch = line.match(/temp[:=\s]+([\d.]+)/i);
            const hashMatch = line.match(/(?:hash|mhs|th)[:=\s]+([\d.]+)/i);
            devs[slotIdx] = {
              ASC: slotIdx,
              Slot: slotIdx,
              Name: `SM${slotIdx}`,
              Status: chips > 0 ? 'Alive' : 'Dead',
              'Effective Chips': chips,
              'Chip Frequency': freqMatch ? Number(freqMatch[1]) : undefined,
              Temperature: tempMatch ? Number(tempMatch[1]) : undefined,
              'MHS av': hashMatch ? Number(hashMatch[1]) * 1_000_000 : undefined,
            };
          }
          const errMatch = line.match(/error[_\s]*code[:=\s]+(\d{3,4})/i);
          if (errMatch) {
            errors.push({ [errMatch[1]]: new Date().toISOString() });
          }
          const vinMatch = line.match(/vin[:=\s]+([\d.]+)/i);
          if (vinMatch) vin = Number(vinMatch[1]);
          const voutMatch = line.match(/vout[:=\s]+([\d.]+)/i);
          if (voutMatch) vout = Number(voutMatch[1]);
          const powerMatch = line.match(/power[:=\s]+(\d+)/i);
          if (powerMatch) power = Number(powerMatch[1]);
        }

        packets = {
          summary: {
            SUMMARY: [
              {
                Power: power,
                'MHS av': devs.filter(Boolean).reduce((a, d) => a + (d['MHS av'] || 0), 0) || undefined,
                'HS RT': devs.filter(Boolean).reduce((a, d) => a + (d['MHS av'] || 0), 0) || undefined,
              },
            ],
          },
          edevs: { DEVS: devs.filter(Boolean) },
          psu: vin || vout ? { Msg: { vin, vout, pin: power } } : undefined,
          errorCode: errors.length > 0 ? { Msg: { error_code: errors } } : undefined,
        };
      }

      const telemetry = parseExactMinerTelemetry(label, 4028, 0, packets);
      appendRuntimeLog('INFO', 'LogParser', `Parsed real hardware telemetry from ${label}.`);
      res.json({ ok: true, miner: telemetry });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: `Failed to parse hardware log/JSON: ${err.message}` });
    }
  });

  // 7. Read & Clear real runtime logs
  app.get('/api/logs', (_req, res) => {
    try {
      if (!fs.existsSync(RUNTIME_LOG_PATH)) {
        res.json({ logs: [] });
        return;
      }
      const lines = fs
        .readFileSync(RUNTIME_LOG_PATH, 'utf-8')
        .split(/\r?\n/)
        .filter(Boolean);
      const logs = lines
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse()
        .slice(0, 250);
      res.json({ logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/logs', (_req, res) => {
    try {
      fs.writeFileSync(RUNTIME_LOG_PATH, '', 'utf-8');
      appendRuntimeLog('INFO', 'LogManager', 'Cleared runtime log history.');
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Repair Bench Tickets persistence (/setting/repair_tickets.json)
  app.get('/api/repairs', (_req, res) => {
    try {
      if (!fs.existsSync(REPAIR_TICKETS_PATH)) {
        res.json({ tickets: [] });
        return;
      }
      const tickets = JSON.parse(fs.readFileSync(REPAIR_TICKETS_PATH, 'utf-8'));
      res.json({ tickets: Array.isArray(tickets) ? tickets : [] });
    } catch {
      res.json({ tickets: [] });
    }
  });

  app.post('/api/repairs', (req, res) => {
    try {
      const existing = fs.existsSync(REPAIR_TICKETS_PATH)
        ? JSON.parse(fs.readFileSync(REPAIR_TICKETS_PATH, 'utf-8'))
        : [];
      const ticket = {
        id: `rep-${Date.now()}`,
        createdAt: new Date().toISOString(),
        ...req.body,
      };
      const updated = [ticket, ...(Array.isArray(existing) ? existing : [])];
      fs.writeFileSync(REPAIR_TICKETS_PATH, JSON.stringify(updated, null, 2), 'utf-8');
      appendRuntimeLog(
        'INFO',
        'RepairBench',
        `Saved repair ticket for SN=${ticket.boardSn || 'N/A'} (${ticket.minerModel || 'WhatsMiner'})`
      );
      res.json({ ok: true, ticket, tickets: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/repairs/:id', (req, res) => {
    try {
      const existing = fs.existsSync(REPAIR_TICKETS_PATH)
        ? JSON.parse(fs.readFileSync(REPAIR_TICKETS_PATH, 'utf-8'))
        : [];
      const updated = (Array.isArray(existing) ? existing : []).filter(
        (t: any) => t.id !== req.params.id
      );
      fs.writeFileSync(REPAIR_TICKETS_PATH, JSON.stringify(updated, null, 2), 'utf-8');
      res.json({ ok: true, tickets: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Host OS SerialPort Discovery (/dev/ttyUSB*, /dev/ttyACM*, /dev/ttyS*) for Hashboard Tester
  app.get('/api/serial/ports', (_req, res) => {
    try {
      const detectedPorts: { path: string; type: string; accessible: boolean }[] = [];
      if (fs.existsSync('/dev')) {
        const entries = fs.readdirSync('/dev');
        for (const name of entries) {
          if (
            name.startsWith('ttyUSB') ||
            name.startsWith('ttyACM') ||
            name.startsWith('ttyAMA') ||
            name.startsWith('ttyCH341') ||
            /^ttyS[0-3]$/.test(name)
          ) {
            const fullPath = `/dev/${name}`;
            let accessible = false;
            try {
              fs.accessSync(fullPath, fs.constants.R_OK);
              accessible = true;
            } catch {
              accessible = false;
            }
            detectedPorts.push({
              path: fullPath,
              type: name.startsWith('ttyUSB') || name.startsWith('ttyCH341')
                ? 'USB-TTL UART Adapter (CP210x/CH340/FT232)'
                : name.startsWith('ttyACM')
                ? 'CDC ACM Tester (Pico / Zynq)'
                : 'Hardware UART Serial Port',
              accessible,
            });
          }
        }
      }
      res.json({ ok: true, ports: detectedPorts });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message, ports: [] });
    }
  });

  // Read available non-blocking snapshot from a host OS serial device file if connected to the server
  app.post('/api/serial/read-device', (req, res) => {
    const devPath = String(req.body.path || '').trim();
    if (!devPath.startsWith('/dev/tty')) {
      res.status(400).json({ ok: false, error: 'Valid /dev/tty* path is required' });
      return;
    }
    try {
      const fd = fs.openSync(devPath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
      const buf = Buffer.alloc(8192);
      let bytesRead = 0;
      try {
        bytesRead = fs.readSync(fd, buf, 0, buf.length, null);
      } catch {
        bytesRead = 0;
      } finally {
        fs.closeSync(fd);
      }
      const text = buf.subarray(0, bytesRead).toString('utf-8').replace(/\0+/g, '');
      res.json({ ok: true, path: devPath, bytesRead, data: text });
    } catch (err: any) {
      res.status(502).json({
        ok: false,
        error: `Cannot open ${devPath} on host OS (${err.message}). Use Browser WebSerial API for client USB-TTL cable.`,
      });
    }
  });

  // 10. Real-Time PSU (P21 / P21D / P21E / P221B / P222B) Fluctuation Poller over TCP 4028
  const PSU_SESSIONS_PATH = path.join(SETTING_DIR, 'psu_sessions.json');

  app.post('/api/psu/poll', async (req, res) => {
    const ip = String(req.body.ip || '').trim();
    const port = Number(req.body.port || 4028);
    if (!ip) {
      res.status(400).json({ ok: false, error: 'Miner IP address is required' });
      return;
    }
    const { systemIni } = readConfigFromDisk();
    const timeoutMs = Math.min(3000, Math.max(400, Number(req.body.timeoutMs || systemIni.MinerTimeout || 1200)));

    try {
      const startEpoch = Date.now();
      const [psuRes, sumRes, errRes] = await Promise.allSettled([
        sendMinerTcpCommand(ip, port, { cmd: 'get_psu' }, timeoutMs),
        sendMinerTcpCommand(ip, port, { cmd: 'summary' }, timeoutMs),
        sendMinerTcpCommand(ip, port, { cmd: 'get_error_code' }, timeoutMs),
      ]);

      if (psuRes.status === 'rejected' && sumRes.status === 'rejected') {
        throw new Error(psuRes.reason?.message || `No TCP 4028 response from ${ip}:${port}`);
      }

      const latencyMs = Date.now() - startEpoch;
      const parsedTelemetry = parseExactMinerTelemetry(ip, port, latencyMs, {
        psu: psuRes.status === 'fulfilled' ? psuRes.value.parsed : undefined,
        summary: sumRes.status === 'fulfilled' ? sumRes.value.parsed : undefined,
        errorCode: errRes.status === 'fulfilled' ? errRes.value.parsed : undefined,
      });

      const psu = parsedTelemetry.psu;
      const voutMv = psu?.voutMv ?? null;
      const voutV = voutMv !== null ? Number((voutMv / 1000).toFixed(3)) : null;
      const ioutA = psu?.ioutA ?? null;
      const poutW =
        voutV !== null && ioutA !== null ? Number((voutV * ioutA).toFixed(1)) : null;
      const temps = [psu?.temp0, psu?.temp1, psu?.temp2].filter(
        (t): t is number => t !== null && t !== undefined
      );
      const tempMaxC = temps.length > 0 ? Math.max(...temps) : null;

      const now = new Date();
      const pad = (n: number, w = 2) => String(n).padStart(w, '0');
      const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(
        now.getMilliseconds(),
        3
      )}`;

      const sample = {
        id: `psu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: timeStr,
        epochMs: Date.now(),
        latencyMs,
        psuModel: psu?.model || '',
        psuVendor: psu?.vendor || '',
        psuSerialNo: psu?.serialNo || '',
        psuVersion: psu?.version || '',
        vinV: psu?.vin ?? null,
        voutMv,
        voutV,
        ioutA,
        pinW: psu?.pinW ?? parsedTelemetry.powerW ?? null,
        poutW,
        fanRpm: psu?.fanRpm ?? null,
        temp0C: psu?.temp0 ?? null,
        temp1C: psu?.temp1 ?? null,
        temp2C: psu?.temp2 ?? null,
        tempMaxC,
        psuErrorCode: psu?.errorCode || '',
        minerHashrateTh: parsedTelemetry.hashrateRtTh,
        minerPowerW: parsedTelemetry.powerW,
        minerFreqMhz: parsedTelemetry.freqAvg,
        minerTargetFreqMhz: parsedTelemetry.targetFreq,
        upfreqComplete: parsedTelemetry.upfreqComplete,
        powerMode: parsedTelemetry.powerMode || '',
        minerErrorCodes: parsedTelemetry.errorCodes.map((e) => e.code),
      };

      res.json({ ok: true, sample, rawPsu: psu?.rawFields || null });
    } catch (err: any) {
      res.status(502).json({ ok: false, error: err.message, ip, port });
    }
  });

  app.get('/api/psu/sessions', (_req, res) => {
    try {
      if (!fs.existsSync(PSU_SESSIONS_PATH)) {
        res.json({ sessions: [] });
        return;
      }
      const data = JSON.parse(fs.readFileSync(PSU_SESSIONS_PATH, 'utf-8'));
      res.json({ sessions: Array.isArray(data) ? data : [] });
    } catch {
      res.json({ sessions: [] });
    }
  });

  app.post('/api/psu/sessions', (req, res) => {
    try {
      const existing = fs.existsSync(PSU_SESSIONS_PATH)
        ? JSON.parse(fs.readFileSync(PSU_SESSIONS_PATH, 'utf-8'))
        : [];
      const session = {
        id: `psulog-${Date.now()}`,
        createdAt: new Date().toISOString(),
        ...req.body,
      };
      const updated = [session, ...(Array.isArray(existing) ? existing : [])].slice(0, 50);
      fs.writeFileSync(PSU_SESSIONS_PATH, JSON.stringify(updated, null, 2), 'utf-8');
      appendRuntimeLog(
        'INFO',
        'PSULogger',
        `Saved PSU fluctuation log session for ${session.targetIp || 'PSU'} (${session.sampleCount || 0} samples)`
      );
      res.json({ ok: true, session, sessions: updated });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.delete('/api/psu/sessions/:id', (req, res) => {
    try {
      const existing = fs.existsSync(PSU_SESSIONS_PATH)
        ? JSON.parse(fs.readFileSync(PSU_SESSIONS_PATH, 'utf-8'))
        : [];
      const updated = (Array.isArray(existing) ? existing : []).filter(
        (s: any) => s.id !== req.params.id
      );
      fs.writeFileSync(PSU_SESSIONS_PATH, JSON.stringify(updated, null, 2), 'utf-8');
      res.json({ ok: true, sessions: updated });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WhatsMinerTool Real TCP 4028 Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
