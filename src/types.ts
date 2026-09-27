export type MinerStatus = 'Mining' | 'Warning' | 'Offline' | 'Upgrading' | 'Rebooting';
export type PowerMode = 'Low' | 'Normal' | 'High';
export type Language = 'fa' | 'en';

export interface HashboardTelemetry {
  slot: number;
  status: string;
  model: string;
  hashrateRtTh: number | null;
  hashrateAvgTh: number | null;
  mhsAv: number | null;
  hsRt: number | null;
  pcbTemp: number | null;
  chipTempMin: number | null;
  chipTempMax: number | null;
  chipTempAvg: number | null;
  freqMhz: number | null;
  effectiveChips: number | null;
  totalChips: number | null;
  hardwareErrors: number | null;
  crcErrors: number | null;
  voltageMv: number | null;
  serialNo: string;
  chipType: string;
  upfreqComplete: number | null;
  rawFields: Record<string, any>;
}

export interface PsuTelemetry {
  model: string;
  vendor: string;
  serialNo: string;
  version: string;
  vin: number | null;
  voutMv: number | null;
  ioutA: number | null;
  pinW: number | null;
  fanRpm: number | null;
  temp0: number | null;
  temp1: number | null;
  temp2: number | null;
  errorCode: string;
  rawFields: Record<string, any>;
}

export interface PoolTelemetry {
  index: number;
  url: string;
  user: string;
  status: string;
  priority: number;
  accepted: number | null;
  rejected: number | null;
  stale: number | null;
  stratumActive: boolean;
  lastShareTime: string;
}

export interface MinerErrorCodeItem {
  code: string;
  reason: string;
  timestamp?: string;
}

export interface MinerUnit {
  id: string;
  ip: string;
  port: number;
  latencyMs: number;
  probedAt: string;
  mac: string;
  hostname: string;
  model: string;
  controlBoard: string;
  firmware: string;
  apiVersion: string;
  serialNo: string;
  ledFlashing: boolean;
  securityMode: number | null;
  liquidCooling: number | null;
  status: MinerStatus;
  hashrateRtTh: number | null;
  hashrateAvgTh: number | null;
  mhsRt: number | null;
  mhsAvg: number | null;
  mhs1m: number | null;
  mhs5m: number | null;
  mhs15m: number | null;
  factoryGhs: number | null;
  powerW: number | null;
  powerRateJTh: number | null;
  powerMode: string;
  freqAvg: number | null;
  targetFreq: number | null;
  upfreqComplete: number | null;
  fanIn: number | null;
  fanOut: number | null;
  envTemp: number | null;
  pcbTempMax: number | null;
  chipTempMin: number | null;
  chipTempAvg: number | null;
  chipTempMax: number | null;
  rejectRate: number | null;
  accepted: number | null;
  rejected: number | null;
  stale: number | null;
  hwErrors: number | null;
  elapsedSec: number | null;
  errorCodes: MinerErrorCodeItem[];
  hashboards: HashboardTelemetry[];
  pools: PoolTelemetry[];
  psu: PsuTelemetry | null;
  rawPackets: Record<string, any>;
}

export interface NetworkInterfaceInfo {
  name: string;
  address: string;
  netmask: string;
  cidr: string;
  suggestedStart: string;
  suggestedEnd: string;
}

export interface IpRange {
  id: string;
  name: string;
  startIp: string;
  endIp: string;
  port: number;
  enabled: boolean;
  lastScanned?: string;
  foundCount: number;
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

export type LogLevel = 'GLOBAL' | 'INFO' | 'DEBUG' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  process: string;
  message: string;
  formatted?: string;
}

export interface WhatsMinerErrorSpec {
  code: string;
  category: 'FAN' | 'PSU' | 'TEMP' | 'HASHBOARD' | 'EEPROM' | 'POOL' | 'CONTROL';
  severity: 'CRITICAL' | 'WARNING';
  titleFa: string;
  titleEn: string;
  causeFa: string;
  causeEn: string;
  testPoints: string;
  repairStepsFa: string[];
  repairStepsEn: string[];
}

export interface RepairTicket {
  id: string;
  createdAt: string;
  customerName: string;
  minerModel: string;
  boardSn: string;
  slotName: string;
  chipType: string;
  errorCode: string;
  ldo1v8: string;
  pld0v8: string;
  clk25Mhz: string;
  domainVoltageMv: string;
  faultyChipNo: string;
  actionTaken: string;
  status: 'PENDING' | 'TESTING' | 'FIXED' | 'SCRAP';
}

// ============================================================================
// DIRECT SERIAL PORT (WebSerial API / OS SerialPort) TYPES FOR HASHBOARD TESTER
// ============================================================================
export interface HostSerialPortInfo {
  path: string;
  type: string;
  accessible: boolean;
}

export interface UartChipDetail {
  chipNumber: number; // 1-based: U1 .. U114
  domainNumber: number; // 1-based: D1 .. D38
  status: 'OK' | 'SIGNAL_BREAK' | 'CRC_FAULT' | 'OVERTEMP' | 'UNREACHED';
  tempC: number | null;
  freqMhz: number | null;
  crcCount: number | null;
  voltageMv: number | null;
}

export interface UartParsedEvent {
  id: string;
  timestamp: string;
  rawLine: string;
  category: 'BOOT' | 'CHIP_ENUM' | 'SIGNAL_FAULT' | 'TEMP_FREQ' | 'EEPROM' | 'PSU' | 'ERROR';
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  slot: number | null;
  detectedChips: number | null;
  totalChips: number | null;
  freqMhz: number | null;
  tempC: number | null;
  voltageMv: number | null;
  faultyChipNo: number | null;
  errorCode: string | null;
  boardSn: string | null;
  chipType: string | null;
  crcErrors: number | null;
  chipDetails?: { chipNo: number; temp?: number; freq?: number; crc?: number; volt?: number }[];
  messageFa: string;
  messageEn: string;
}

// ============================================================================
// REAL-TIME PSU P21 / P221B FLUCTUATION LOGGER TYPES
// ============================================================================
export interface PsuRealtimeSample {
  id: string;
  timestamp: string;
  epochMs: number;
  latencyMs: number;
  psuModel: string;
  psuVendor: string;
  psuSerialNo: string;
  psuVersion: string;
  vinV: number | null;
  voutMv: number | null;
  voutV: number | null;
  ioutA: number | null;
  pinW: number | null;
  poutW: number | null;
  fanRpm: number | null;
  temp0C: number | null;
  temp1C: number | null;
  temp2C: number | null;
  tempMaxC: number | null;
  psuErrorCode: string;
  minerHashrateTh: number | null;
  minerPowerW: number | null;
  minerFreqMhz: number | null;
  minerTargetFreqMhz: number | null;
  upfreqComplete: number | null;
  powerMode: string;
  minerErrorCodes: string[];
}

export interface PsuAnomalyEvent {
  id: string;
  timestamp: string;
  type: 'AC_UNDERVOLT' | 'AC_OVERVOLT' | 'DC_RIPPLE_SAG' | 'PSU_OVERTEMP' | 'PSU_FAN_FAULT' | 'PSU_ERR_CODE';
  severity: 'WARNING' | 'CRITICAL';
  measuredValue: string;
  thresholdInfo: string;
  descriptionFa: string;
  descriptionEn: string;
}

export interface PsuLogSession {
  id: string;
  createdAt: string;
  targetIp: string;
  port: number;
  psuModel: string;
  psuSerialNo: string;
  psuVersion: string;
  sampleCount: number;
  durationSec: number;
  stats: {
    vinMinV: number | null;
    vinMaxV: number | null;
    vinDeltaV: number | null;
    voutMinMv: number | null;
    voutMaxMv: number | null;
    voutRippleMv: number | null;
    ioutMaxA: number | null;
    pinMaxW: number | null;
    tempMaxC: number | null;
    fanMinRpm: number | null;
    anomalyCount: number;
    verdict: 'HEALTHY' | 'WARNING_RIPPLE' | 'CRITICAL_FAULT' | 'INSUFFICIENT_DATA';
  };
  anomalies: PsuAnomalyEvent[];
  samples: PsuRealtimeSample[];
}
