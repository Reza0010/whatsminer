import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileText,
  Play,
  RefreshCw,
  Save,
  Square,
  Trash2,
} from 'lucide-react';
import {
  Language,
  MinerUnit,
  PsuAnomalyEvent,
  PsuLogSession,
  PsuRealtimeSample,
} from './types';

interface PsuRealtimeLoggerProps {
  lang: Language;
  miners: MinerUnit[];
  defaultIp: string;
  defaultPort: number;
  notify: (type: 'info' | 'success' | 'warning', text: string) => void;
}

type ChartMode = 'VOLTAGE' | 'CURRENT_POWER' | 'TEMP_FREQ';

export const PsuRealtimeLogger: React.FC<PsuRealtimeLoggerProps> = ({
  lang,
  miners,
  defaultIp,
  defaultPort,
  notify,
}) => {
  const isRtl = lang === 'fa';

  const [targetIp, setTargetIp] = useState<string>(defaultIp || '192.168.1.100');
  const [targetPort, setTargetPort] = useState<number>(defaultPort || 4028);
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(2000);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPollingOnce, setIsPollingOnce] = useState<boolean>(false);
  const [lastPollError, setLastPollError] = useState<string | null>(null);

  const [samples, setSamples] = useState<PsuRealtimeSample[]>([]);
  const [anomalies, setAnomalies] = useState<PsuAnomalyEvent[]>([]);
  const [savedSessions, setSavedSessions] = useState<PsuLogSession[]>([]);
  const [chartMode, setChartMode] = useState<ChartMode>('VOLTAGE');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [rawPsuInput, setRawPsuInput] = useState<string>('');

  const startEpochRef = useRef<number | null>(null);

  useEffect(() => {
    if (defaultIp && !isRecording && samples.length === 0) {
      setTargetIp(defaultIp);
    }
  }, [defaultIp]);

  useEffect(() => {
    loadSavedSessions();
  }, []);

  const loadSavedSessions = async () => {
    try {
      const res = await fetch('/api/psu/sessions');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sessions)) {
          setSavedSessions(data.sessions);
        }
      }
    } catch {
      // ignore
    }
  };

  // Evaluate hardware anomalies on each real sample based on MicroBT P21 / P221B specs
  const evaluateSampleAnomalies = (
    sample: PsuRealtimeSample,
    allSamples: PsuRealtimeSample[]
  ) => {
    const detected: PsuAnomalyEvent[] = [];

    if (sample.vinV !== null && sample.vinV < 195) {
      detected.push({
        id: `anom-vin-low-${sample.id}`,
        timestamp: sample.timestamp,
        type: 'AC_UNDERVOLT',
        severity: sample.vinV < 185 ? 'CRITICAL' : 'WARNING',
        measuredValue: `${sample.vinV} V`,
        thresholdInfo: 'Min 195V AC (Code 250/255)',
        descriptionFa: `افت ولتاژ برق ورودی به ${sample.vinV}V (زیر آستانه استاندارد ۱۹۵ ولت پاور P21/P221B — خطر خاموشی در لحظه Upfreq)`,
        descriptionEn: `AC Input Brownout: Vin dropped to ${sample.vinV}V (< 195V threshold for P21/P221B PSU)`,
      });
    }

    if (sample.vinV !== null && sample.vinV > 265) {
      detected.push({
        id: `anom-vin-high-${sample.id}`,
        timestamp: sample.timestamp,
        type: 'AC_OVERVOLT',
        severity: 'CRITICAL',
        measuredValue: `${sample.vinV} V`,
        thresholdInfo: 'Max 265V AC (Code 251)',
        descriptionFa: `اضافه‌ولتاژ شدید برق ورودی (${sample.vinV}V > 265V)`,
        descriptionEn: `AC Input Overvoltage: Vin reached ${sample.vinV}V (> 265V limit)`,
      });
    }

    const validVouts = allSamples
      .map((s) => s.voutMv)
      .filter((v): v is number => v !== null);
    if (sample.voutMv !== null && validVouts.length >= 2) {
      const maxV = Math.max(...validVouts, sample.voutMv);
      const minV = Math.min(...validVouts, sample.voutMv);
      const rippleMv = maxV - minV;
      if (rippleMv >= 250) {
        detected.push({
          id: `anom-vout-sag-${sample.id}`,
          timestamp: sample.timestamp,
          type: 'DC_RIPPLE_SAG',
          severity: rippleMv >= 450 ? 'CRITICAL' : 'WARNING',
          measuredValue: `ΔVout = ${rippleMv} mV (${sample.voutMv} mV)`,
          thresholdInfo: 'Max Ripple < 250mV',
          descriptionFa: `ریپل / افت ولتاژ DC خروجی پاور به میزان ${rippleMv}mV (احتمال تضعیف خازن‌های صافی یا ماسفت‌های ثانویه)`,
          descriptionEn: `DC Output Voltage Sag/Ripple of ${rippleMv}mV detected (${minV}..${maxV}mV)`,
        });
      }
    }

    if (sample.tempMaxC !== null && sample.tempMaxC >= 85) {
      detected.push({
        id: `anom-temp-${sample.id}`,
        timestamp: sample.timestamp,
        type: 'PSU_OVERTEMP',
        severity: sample.tempMaxC >= 95 ? 'CRITICAL' : 'WARNING',
        measuredValue: `${sample.tempMaxC} °C`,
        thresholdInfo: 'Max 85°C (Code 270)',
        descriptionFa: `دمای سنسور داخلی پاور به ${sample.tempMaxC}°C رسید (خطای Code 270 / بررسی فن پاور و هیت‌سینک PFC)`,
        descriptionEn: `PSU internal sensor reached ${sample.tempMaxC}°C (>= 85°C thermal threshold)`,
      });
    }

    if (sample.fanRpm !== null && sample.fanRpm === 0 && (sample.pinW ?? 0) > 200) {
      detected.push({
        id: `anom-fan-${sample.id}`,
        timestamp: sample.timestamp,
        type: 'PSU_FAN_FAULT',
        severity: 'CRITICAL',
        measuredValue: '0 RPM',
        thresholdInfo: '> 1500 RPM under load',
        descriptionFa: 'توقف کامل فن خنک‌کننده پاور در زیر بار (خطای Code 267/270)',
        descriptionEn: 'PSU cooling fan speed is 0 RPM under load',
      });
    }

    if (sample.psuErrorCode && sample.psuErrorCode !== '0' && sample.psuErrorCode !== '') {
      detected.push({
        id: `anom-err-${sample.id}`,
        timestamp: sample.timestamp,
        type: 'PSU_ERR_CODE',
        severity: 'CRITICAL',
        measuredValue: `PSU Code ${sample.psuErrorCode}`,
        thresholdInfo: 'error_code = 0',
        descriptionFa: `ثبت کد خطای سخت‌افزاری ${sample.psuErrorCode} در رجیستر داخلی پاور (get_psu)`,
        descriptionEn: `PSU internal register reported error_code: ${sample.psuErrorCode}`,
      });
    }

    if (detected.length > 0) {
      setAnomalies((prev) => [...detected, ...prev].slice(0, 150));
    }
  };

  // Poll a single real PSU sample over TCP 4028
  const pollSingleSample = async (silent = false) => {
    if (!targetIp.trim()) return;
    if (!silent) setIsPollingOnce(true);
    try {
      const res = await fetch('/api/psu/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: targetIp.trim(),
          port: Number(targetPort) || 4028,
        }),
      });
      const data = await res.json();
      if (res.ok && data.sample) {
        setLastPollError(null);
        const newSample: PsuRealtimeSample = data.sample;
        setSamples((prev) => {
          const updated = [...prev, newSample].slice(-300);
          evaluateSampleAnomalies(newSample, updated);
          return updated;
        });
        if (!silent) {
          notify(
            'success',
            isRtl
              ? `نمونه واقعی پاور از ${targetIp}:${targetPort} دریافت شد (Vin=${
                  newSample.vinV ?? '—'
                }V, Vout=${newSample.voutMv ?? '—'}mV)`
              : `Captured live PSU sample from ${targetIp}:${targetPort}`
          );
        }
      } else {
        setLastPollError(data.error || `No response from ${targetIp}:${targetPort}`);
        if (!silent) {
          notify(
            'warning',
            isRtl
              ? `عدم پاسخ از پورت 4028 دستگاه ${targetIp}: ${data.error || 'Timeout'}`
              : `No TCP 4028 response from ${targetIp}: ${data.error || 'Timeout'}`
          );
        }
      }
    } catch (err: any) {
      setLastPollError(err.message);
    } finally {
      if (!silent) setIsPollingOnce(false);
    }
  };

  // Continuous Real-Time Polling Loop
  useEffect(() => {
    if (!isRecording) return;
    if (!startEpochRef.current) {
      startEpochRef.current = Date.now();
    }
    pollSingleSample(true);
    const timer = setInterval(() => {
      pollSingleSample(true);
    }, Math.max(1000, pollIntervalMs));
    return () => clearInterval(timer);
  }, [isRecording, pollIntervalMs, targetIp, targetPort]);

  // Parse pasted real get_psu JSON or multi-line PSU UART log
  const handleParseRawPsuLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawPsuInput.trim()) return;

    const lines = rawPsuInput.trim().split(/\r?\n/).filter(Boolean);
    const parsedSamples: PsuRealtimeSample[] = [];
    const toNum = (v: unknown): number | null => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    try {
      if (rawPsuInput.trim().startsWith('{') || rawPsuInput.trim().startsWith('[')) {
        const parsedJson = JSON.parse(rawPsuInput.trim());
        const items = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
        items.forEach((obj, idx) => {
          const msg = obj.Msg && typeof obj.Msg === 'object' ? obj.Msg : obj.PSU || obj;
          const voutMv = toNum(msg.vout);
          const voutV =
            voutMv !== null
              ? voutMv > 100
                ? Number((voutMv / 1000).toFixed(3))
                : voutMv
              : null;
          const normalizedVoutMv =
            voutMv !== null ? (voutMv < 100 ? Math.round(voutMv * 1000) : voutMv) : null;
          const ioutA = toNum(msg.iout);
          const t0 = toNum(msg.temp0);
          const t1 = toNum(msg.temp1);
          const t2 = toNum(msg.temp2);
          const tArr = [t0, t1, t2].filter((t): t is number => t !== null);

          parsedSamples.push({
            id: `psu-import-${Date.now()}-${idx}`,
            timestamp: obj.timestamp || new Date().toTimeString().slice(0, 8),
            epochMs: Date.now() + idx * 1000,
            latencyMs: 0,
            psuModel: String(msg.model ?? msg.name ?? ''),
            psuVendor: String(msg.vendor ?? ''),
            psuSerialNo: String(msg.serial_no ?? ''),
            psuVersion: String(msg.version ?? ''),
            vinV: toNum(msg.vin),
            voutMv: normalizedVoutMv,
            voutV,
            ioutA,
            pinW: toNum(msg.pin ?? msg.power),
            poutW: voutV !== null && ioutA !== null ? Number((voutV * ioutA).toFixed(1)) : null,
            fanRpm: toNum(msg.fan_speed),
            temp0C: t0,
            temp1C: t1,
            temp2C: t2,
            tempMaxC: tArr.length > 0 ? Math.max(...tArr) : null,
            psuErrorCode: String(msg.error_code ?? ''),
            minerHashrateTh: toNum(msg.hashrate ?? msg.hs_rt),
            minerPowerW: toNum(msg.pin ?? msg.power),
            minerFreqMhz: toNum(msg.freq ?? msg.freq_avg),
            minerTargetFreqMhz: toNum(msg.target_freq),
            upfreqComplete: toNum(msg.upfreq_complete),
            powerMode: String(msg.power_mode ?? ''),
            minerErrorCodes: [],
          });
        });
      } else {
        // Parse line-by-line PSU UART / btminer log lines
        lines.forEach((line, idx) => {
          const vinM = line.match(/vin[:=\s]+([\d.]+)/i);
          const voutM = line.match(/vout[:=\s]+([\d.]+)/i);
          const ioutM = line.match(/iout[:=\s]+([\d.]+)/i);
          const pinM = line.match(/(?:pin|power)[:=\s]+([\d.]+)/i);
          const fanM = line.match(/(?:fan_speed|psu_fan|fan)[:=\s]+(\d+)/i);
          const t0M = line.match(/temp0[:=\s]+([\d.]+)/i);
          const t1M = line.match(/temp1[:=\s]+([\d.]+)/i);
          const t2M = line.match(/temp2[:=\s]+([\d.]+)/i);
          const freqM = line.match(/freq[:=\s]+(\d+)/i);
          const modelM = line.match(/\b(P21[A-Z0-9]*|P22[12][A-Z0-9]*)\b/i);
          const snM = line.match(/(?:serial_no|psu_sn|sn)[:=\s]+([A-Z0-9]{6,24})/i);
          const errM = line.match(/error_code[:=\s]+(\d+)/i);
          const timeM = line.match(/(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)/);

          if (vinM || voutM || ioutM || pinM || t0M) {
            const rawVout = voutM ? Number(voutM[1]) : null;
            const voutMv =
              rawVout !== null ? (rawVout < 100 ? Math.round(rawVout * 1000) : rawVout) : null;
            const voutV = voutMv !== null ? Number((voutMv / 1000).toFixed(3)) : null;
            const ioutA = ioutM ? Number(ioutM[1]) : null;
            const t0 = t0M ? Number(t0M[1]) : null;
            const t1 = t1M ? Number(t1M[1]) : null;
            const t2 = t2M ? Number(t2M[1]) : null;
            const tArr = [t0, t1, t2].filter((t): t is number => t !== null);

            parsedSamples.push({
              id: `psu-line-${Date.now()}-${idx}`,
              timestamp: timeM ? timeM[1] : `S#${idx + 1}`,
              epochMs: Date.now() + idx * 1000,
              latencyMs: 0,
              psuModel: modelM ? modelM[1].toUpperCase() : '',
              psuVendor: '',
              psuSerialNo: snM ? snM[1] : '',
              psuVersion: '',
              vinV: vinM ? Number(vinM[1]) : null,
              voutMv,
              voutV,
              ioutA,
              pinW: pinM ? Number(pinM[1]) : null,
              poutW: voutV !== null && ioutA !== null ? Number((voutV * ioutA).toFixed(1)) : null,
              fanRpm: fanM ? Number(fanM[1]) : null,
              temp0C: t0,
              temp1C: t1,
              temp2C: t2,
              tempMaxC: tArr.length > 0 ? Math.max(...tArr) : null,
              psuErrorCode: errM ? errM[1] : '',
              minerHashrateTh: null,
              minerPowerW: pinM ? Number(pinM[1]) : null,
              minerFreqMhz: freqM ? Number(freqM[1]) : null,
              minerTargetFreqMhz: null,
              upfreqComplete: null,
              powerMode: '',
              minerErrorCodes: [],
            });
          }
        });
      }

      if (parsedSamples.length > 0) {
        setSamples((prev) => {
          const combined = [...prev, ...parsedSamples].slice(-300);
          parsedSamples.forEach((s) => evaluateSampleAnomalies(s, combined));
          return combined;
        });
        notify(
          'success',
          isRtl
            ? `${parsedSamples.length} نمونه واقعی پاور استخراج و روی نمودار نوسان ترسیم شد.`
            : `Extracted and plotted ${parsedSamples.length} real PSU samples.`
        );
      } else {
        notify(
          'warning',
          isRtl
            ? 'هیچ پارامتر معتبری (vin, vout, iout, pin) در متن ورودی یافت نشد.'
            : 'No valid PSU telemetry fields (vin, vout, iout, pin) found in input.'
        );
      }
    } catch (err: any) {
      notify('warning', err.message);
    }
  };

  // Compute exact statistical metrics strictly from recorded samples
  const psuStats = useMemo(() => {
    const vins = samples.map((s) => s.vinV).filter((v): v is number => v !== null);
    const vouts = samples.map((s) => s.voutMv).filter((v): v is number => v !== null);
    const iouts = samples.map((s) => s.ioutA).filter((v): v is number => v !== null);
    const pins = samples.map((s) => s.pinW).filter((v): v is number => v !== null);
    const temps = samples.map((s) => s.tempMaxC).filter((v): v is number => v !== null);
    const fans = samples.map((s) => s.fanRpm).filter((v): v is number => v !== null);

    const vinMinV = vins.length > 0 ? Number(Math.min(...vins).toFixed(1)) : null;
    const vinMaxV = vins.length > 0 ? Number(Math.max(...vins).toFixed(1)) : null;
    const vinDeltaV =
      vinMinV !== null && vinMaxV !== null ? Number((vinMaxV - vinMinV).toFixed(1)) : null;

    const voutMinMv = vouts.length > 0 ? Math.min(...vouts) : null;
    const voutMaxMv = vouts.length > 0 ? Math.max(...vouts) : null;
    const voutRippleMv =
      voutMinMv !== null && voutMaxMv !== null ? voutMaxMv - voutMinMv : null;

    const ioutMaxA = iouts.length > 0 ? Number(Math.max(...iouts).toFixed(1)) : null;
    const pinMaxW = pins.length > 0 ? Math.max(...pins) : null;
    const tempMaxC = temps.length > 0 ? Number(Math.max(...temps).toFixed(1)) : null;
    const fanMinRpm = fans.length > 0 ? Math.min(...fans) : null;

    const latest = samples[samples.length - 1] || null;

    let verdict: PsuLogSession['stats']['verdict'] = 'INSUFFICIENT_DATA';
    if (samples.length > 0) {
      const hasCrit =
        (vinMinV !== null && vinMinV < 190) ||
        (voutRippleMv !== null && voutRippleMv >= 450) ||
        (tempMaxC !== null && tempMaxC >= 90) ||
        anomalies.some((a) => a.severity === 'CRITICAL');
      const hasWarn =
        (vinMinV !== null && vinMinV < 200) ||
        (voutRippleMv !== null && voutRippleMv >= 250) ||
        (tempMaxC !== null && tempMaxC >= 80) ||
        anomalies.length > 0;
      verdict = hasCrit ? 'CRITICAL_FAULT' : hasWarn ? 'WARNING_RIPPLE' : 'HEALTHY';
    }

    return {
      latest,
      vinMinV,
      vinMaxV,
      vinDeltaV,
      voutMinMv,
      voutMaxMv,
      voutRippleMv,
      ioutMaxA,
      pinMaxW,
      tempMaxC,
      fanMinRpm,
      verdict,
    };
  }, [samples, anomalies]);

  // Save current PSU session to disk (/setting/psu_sessions.json)
  const handleSaveSessionToDisk = async () => {
    if (samples.length === 0) {
      notify(
        'warning',
        isRtl
          ? 'ابتدا حداقل یک نمونه واقعی از پاور ثبت کنید.'
          : 'Record at least one PSU sample before saving.'
      );
      return;
    }
    const firstEpoch = samples[0].epochMs;
    const lastEpoch = samples[samples.length - 1].epochMs;
    const durationSec = Math.max(1, Math.round((lastEpoch - firstEpoch) / 1000));

    try {
      const res = await fetch('/api/psu/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetIp,
          port: targetPort,
          psuModel: psuStats.latest?.psuModel || 'WhatsMiner PSU',
          psuSerialNo: psuStats.latest?.psuSerialNo || '',
          psuVersion: psuStats.latest?.psuVersion || '',
          sampleCount: samples.length,
          durationSec,
          stats: {
            vinMinV: psuStats.vinMinV,
            vinMaxV: psuStats.vinMaxV,
            vinDeltaV: psuStats.vinDeltaV,
            voutMinMv: psuStats.voutMinMv,
            voutMaxMv: psuStats.voutMaxMv,
            voutRippleMv: psuStats.voutRippleMv,
            ioutMaxA: psuStats.ioutMaxA,
            pinMaxW: psuStats.pinMaxW,
            tempMaxC: psuStats.tempMaxC,
            fanMinRpm: psuStats.fanMinRpm,
            anomalyCount: anomalies.length,
            verdict: psuStats.verdict,
          },
          anomalies,
          samples,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSavedSessions(data.sessions || []);
        notify(
          'success',
          isRtl
            ? 'نشست تست نوسان پاور در فایل setting/psu_sessions.json ذخیره شد.'
            : 'Saved PSU fluctuation log session to setting/psu_sessions.json.'
        );
      }
    } catch (err: any) {
      notify('warning', err.message);
    }
  };

  // Export CSV
  const handleExportPsuCsv = () => {
    if (samples.length === 0) return;
    const headers = [
      'Timestamp',
      'PSU_Model',
      'PSU_SN',
      'Vin(V)',
      'Vout(mV)',
      'Vout(V)',
      'Iout(A)',
      'Pin(W)',
      'Pout(W)',
      'PSU_Fan(RPM)',
      'Temp0(C)',
      'Temp1(C)',
      'Temp2(C)',
      'Miner_Hashrate(TH/s)',
      'Miner_Freq(MHz)',
      'PSU_ErrorCode',
    ];
    const rows = samples.map((s) =>
      [
        s.timestamp,
        s.psuModel,
        s.psuSerialNo,
        s.vinV ?? '',
        s.voutMv ?? '',
        s.voutV ?? '',
        s.ioutA ?? '',
        s.pinW ?? '',
        s.poutW ?? '',
        s.fanRpm ?? '',
        s.temp0C ?? '',
        s.temp1C ?? '',
        s.temp2C ?? '',
        s.minerHashrateTh ?? '',
        s.minerFreqMhz ?? '',
        s.psuErrorCode || '0',
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `psu_logger_${targetIp}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Generate Printable HTML PSU Health Certificate for Customer / Workshop
  const handleDownloadHealthReport = () => {
    if (samples.length === 0) return;
    const latest = psuStats.latest;
    const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8" />
<title>گزارش فنی تست نوسان و سلامت پاور واتس‌ماینر - ${latest?.psuSerialNo || targetIp}</title>
<style>
  body { font-family: Tahoma, Arial, sans-serif; background: #fff; color: #111; padding: 24px; line-height: 1.6; }
  h1 { font-size: 18px; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .meta, .stats { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  .meta td, .meta th, .stats td, .stats th { border: 1px solid #ccc; padding: 8px; text-align: right; }
  .stats th { background: #f3f4f6; }
  .verdict { margin-top: 16px; padding: 12px; border: 1px solid #000; font-weight: bold; }
</style>
</head>
<body>
  <h1>گواهی فنی تست بار و نوسان پاور واتس‌ماینر (PSU P21 / P221B Real-Time Report)</h1>
  <table class="meta">
    <tr>
      <th>آدرس دستگاه / میز تست</th><td>${targetIp}:${targetPort}</td>
      <th>مدل پاور (PSU Model)</th><td>${latest?.psuModel || '—'} (${latest?.psuVersion || '—'})</td>
    </tr>
    <tr>
      <th>سریال پاور (Serial No)</th><td>${latest?.psuSerialNo || '—'}</td>
      <th>تعداد نمونه‌های ثبت‌شده</th><td>${samples.length} نمونه واقعی</td>
    </tr>
  </table>

  <table class="stats">
    <thead>
      <tr>
        <th>پارامتر الکتریکی / حرارتی</th>
        <th>کمینه (Min)</th>
        <th>بیشینه (Max)</th>
        <th>نوسان / ریپل (Delta)</th>
        <th>آخرین مقدار ثبت‌شده</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>ولتاژ ورودی متناوب (Vin AC)</td>
        <td>${psuStats.vinMinV ?? '—'} V</td>
        <td>${psuStats.vinMaxV ?? '—'} V</td>
        <td>Δ ${psuStats.vinDeltaV ?? '—'} V</td>
        <td>${latest?.vinV ?? '—'} V</td>
      </tr>
      <tr>
        <td>ولتاژ خروجی مستقیم هش‌برد (Vout DC)</td>
        <td>${psuStats.voutMinMv ?? '—'} mV</td>
        <td>${psuStats.voutMaxMv ?? '—'} mV</td>
        <td>Ripple: ${psuStats.voutRippleMv ?? '—'} mV</td>
        <td>${latest?.voutMv ?? '—'} mV (${latest?.voutV ?? '—'} V)</td>
      </tr>
      <tr>
        <td>جریان و توان خروجی (Iout / Pin)</td>
        <td>—</td>
        <td>${psuStats.ioutMaxA ?? '—'} A / ${psuStats.pinMaxW ?? '—'} W</td>
        <td>—</td>
        <td>${latest?.ioutA ?? '—'} A / ${latest?.pinW ?? '—'} W</td>
      </tr>
      <tr>
        <td>دمای سنسورهای داخلی (Temp 0/1/2)</td>
        <td>—</td>
        <td>Max: ${psuStats.tempMaxC ?? '—'} °C</td>
        <td>Fan Min: ${psuStats.fanMinRpm ?? '—'} RPM</td>
        <td>${latest?.temp0C ?? '—'} / ${latest?.temp1C ?? '—'} / ${latest?.temp2C ?? '—'} °C</td>
      </tr>
    </tbody>
  </table>

  <div class="verdict">
    نتیجه ارزیابی مهندسی: ${
      psuStats.verdict === 'HEALTHY'
        ? 'سالم (HEALTHY - ولتاژ ورودی و ریپل خروجی DC در محدوده استاندارد MicroBT)'
        : psuStats.verdict === 'WARNING_RIPPLE'
        ? 'نیاز به بررسی (WARNING - نوسان ولتاژ یا دمای بالا مشاهده شد)'
        : 'دارای خطای بحرانی (CRITICAL FAULT - افت شدید ولتاژ یا خطای سخت‌افزاری پاور)'
    }
  </div>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PSU_Health_Certificate_${latest?.psuSerialNo || targetIp}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Build SVG Dual-Channel Waveform Geometry from real samples
  const svgChartData = useMemo(() => {
    const W = 820;
    const H = 240;
    const PAD_X = 48;
    const PAD_Y = 24;
    const plotW = W - PAD_X * 2;
    const plotH = H - PAD_Y * 2;

    if (samples.length === 0) {
      return { W, H, traceA: '', traceB: '', pointsA: [], pointsB: [], labelA: '', labelB: '' };
    }

    const extractPair = (s: PsuRealtimeSample): [number | null, number | null] => {
      if (chartMode === 'VOLTAGE') return [s.vinV, s.voutMv];
      if (chartMode === 'CURRENT_POWER') return [s.ioutA, s.pinW];
      return [s.tempMaxC, s.minerFreqMhz];
    };

    const valsA = samples.map((s) => extractPair(s)[0]).filter((v): v is number => v !== null);
    const valsB = samples.map((s) => extractPair(s)[1]).filter((v): v is number => v !== null);

    const minA = valsA.length > 0 ? Math.min(...valsA) : 0;
    const maxA = valsA.length > 0 ? Math.max(...valsA) : 100;
    const spanA = Math.max(1, maxA - minA);

    const minB = valsB.length > 0 ? Math.min(...valsB) : 0;
    const maxB = valsB.length > 0 ? Math.max(...valsB) : 100;
    const spanB = Math.max(1, maxB - minB);

    const pointsA: { x: number; y: number; val: number; idx: number }[] = [];
    const pointsB: { x: number; y: number; val: number; idx: number }[] = [];

    samples.forEach((s, idx) => {
      const x =
        samples.length === 1
          ? PAD_X + plotW / 2
          : PAD_X + (idx / (samples.length - 1)) * plotW;
      const [vA, vB] = extractPair(s);
      if (vA !== null) {
        const y = PAD_Y + plotH - ((vA - minA) / spanA) * plotH;
        pointsA.push({ x, y, val: vA, idx });
      }
      if (vB !== null) {
        const y = PAD_Y + plotH - ((vB - minB) / spanB) * plotH;
        pointsB.push({ x, y, val: vB, idx });
      }
    });

    const toPath = (pts: { x: number; y: number }[]) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    const labelA =
      chartMode === 'VOLTAGE'
        ? `Vin AC (${minA.toFixed(1)}..${maxA.toFixed(1)} V)`
        : chartMode === 'CURRENT_POWER'
        ? `Iout DC (${minA.toFixed(1)}..${maxA.toFixed(1)} A)`
        : `PSU Temp (${minA.toFixed(1)}..${maxA.toFixed(1)} °C)`;

    const labelB =
      chartMode === 'VOLTAGE'
        ? `Vout DC (${minB.toFixed(0)}..${maxB.toFixed(0)} mV)`
        : chartMode === 'CURRENT_POWER'
        ? `Pin Power (${minB.toFixed(0)}..${maxB.toFixed(0)} W)`
        : `Miner Freq (${minB.toFixed(0)}..${maxB.toFixed(0)} MHz)`;

    return {
      W,
      H,
      traceA: toPath(pointsA),
      traceB: toPath(pointsB),
      pointsA,
      pointsB,
      labelA,
      labelB,
    };
  }, [samples, chartMode]);

  const hoveredSample =
    hoverIndex !== null && samples[hoverIndex]
      ? samples[hoverIndex]
      : samples[samples.length - 1] || null;

  return (
    <div className="space-y-6">
      {/* Top Control & Configuration Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 5 Cols: Real-Time TCP 4028 PSU Poller Controls */}
        <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">
                {isRtl
                  ? 'پایش لحظه‌ای نوسان برق و پاور (PSU P21 / P221B Real-Time Logger)'
                  : 'PSU P21 / P221B Real-Time Voltage & Ripple Logger'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isRtl
                  ? 'خواندن مستمر دستورات واقعی get_psu و summary روی پورت 4028 جهت تشخیص افت ولتاژ برق شهر (Vin) و ریپل خروجی (Vout) در مرحله Upfreq.'
                  : 'Continuous TCP 4028 polling of get_psu & summary to capture AC brownouts and DC ripple during Upfreq.'}
              </p>
            </div>
            <span className="text-xs font-mono text-cyan-400 shrink-0">
              {isRecording ? 'LOGGING LIVE' : `${samples.length} SAMPLES`}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="col-span-2">
              <label className="block text-slate-400 mb-1">
                {isRtl ? 'آدرس IP ماینر هدف' : 'Target Miner IP'}
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={targetIp}
                  disabled={isRecording}
                  onChange={(e) => setTargetIp(e.target.value)}
                  placeholder="192.168.1.100"
                  className="flex-1 px-3 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                />
                {miners.length > 0 && (
                  <select
                    value={targetIp}
                    disabled={isRecording}
                    onChange={(e) => setTargetIp(e.target.value)}
                    className="px-2 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-cyan-300"
                  >
                    {miners.map((m) => (
                      <option key={m.id} value={m.ip}>
                        {m.ip} ({m.psu?.model || m.model || 'Miner'})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                {isRtl ? 'نرخ نمونه‌برداری' : 'Sample Rate'}
              </label>
              <select
                value={pollIntervalMs}
                onChange={(e) => setPollIntervalMs(Number(e.target.value))}
                className="w-full px-2 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
              >
                <option value={1000}>1.0s (Fast)</option>
                <option value={2000}>2.0s (Standard)</option>
                <option value={5000}>5.0s</option>
                <option value={10000}>10.0s</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!isRecording ? (
              <button
                type="button"
                onClick={() => {
                  startEpochRef.current = Date.now();
                  setIsRecording(true);
                }}
                className="flex-1 py-2 px-4 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>
                  {isRtl ? 'شروع ثبت لحظه‌ای پاور (Start Logger)' : 'Start Real-Time PSU Logger'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsRecording(false)}
                className="flex-1 py-2 px-4 rounded-md bg-rose-500 hover:bg-rose-400 text-slate-950 font-semibold text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5" />
                <span>{isRtl ? 'توقف نمونه‌برداری (Stop)' : 'Stop PSU Logger'}</span>
              </button>
            )}

            <button
              type="button"
              disabled={isPollingOnce || isRecording}
              onClick={() => pollSingleSample(false)}
              className="py-2 px-3 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPollingOnce ? 'animate-spin' : ''}`} />
              <span>{isRtl ? 'تک‌نمونه get_psu' : 'Single Sample'}</span>
            </button>
          </div>

          {lastPollError && (
            <div className="p-2.5 rounded bg-rose-950/50 border border-rose-800 text-xs font-mono text-rose-200">
              {lastPollError}
            </div>
          )}

          {/* Export & Save Controls */}
          <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={samples.length === 0}
              onClick={handleSaveSessionToDisk}
              className="px-3 py-1.5 rounded bg-[#0B0E17] hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-xs text-cyan-300 cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isRtl ? 'ذخیره در دیسک' : 'Save Session'}</span>
            </button>

            <button
              type="button"
              disabled={samples.length === 0}
              onClick={handleExportPsuCsv}
              className="px-3 py-1.5 rounded bg-[#0B0E17] hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-xs text-slate-200 cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              disabled={samples.length === 0}
              onClick={handleDownloadHealthReport}
              className="px-3 py-1.5 rounded bg-[#0B0E17] hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-xs text-emerald-300 cursor-pointer flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isRtl ? 'صدور گواهی سلامت پاور' : 'PSU Health Certificate'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSamples([]);
                setAnomalies([]);
              }}
              className="px-2.5 py-1.5 rounded bg-[#0B0E17] hover:bg-slate-800 border border-slate-800 text-xs text-slate-400 hover:text-rose-400 cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right 7 Cols: Live PSU Electrical & Thermal Summary Matrix */}
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">
                {isRtl
                  ? 'پارامترهای واقعی ولتاژ، ریپل، جریان و سنسورهای حرارتی پاور'
                  : 'Real-Time PSU Electrical & Thermal Fluctuation Matrix'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                {psuStats.latest
                  ? `Model: ${psuStats.latest.psuModel || '—'} · SN: ${
                      psuStats.latest.psuSerialNo || '—'
                    } · FW: ${psuStats.latest.psuVersion || '—'}`
                  : isRtl
                  ? 'هنوز نمونه‌ای ثبت نشده است — به پورت 4028 متصل شوید یا خروجی واقعی get_psu را وارد کنید'
                  : 'No PSU samples recorded yet — start live polling or paste real get_psu output below'}
              </p>
            </div>

            <span
              className={`text-xs font-mono font-semibold ${
                psuStats.verdict === 'HEALTHY'
                  ? 'text-emerald-400'
                  : psuStats.verdict === 'WARNING_RIPPLE'
                  ? 'text-amber-400'
                  : psuStats.verdict === 'CRITICAL_FAULT'
                  ? 'text-rose-400'
                  : 'text-slate-500'
              }`}
            >
              {psuStats.verdict}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
            <div className="p-3 rounded bg-[#0B0E17] border border-slate-800">
              <div className="text-slate-400">Vin AC (Min..Max)</div>
              <div className="text-base font-bold text-white mt-1">
                {psuStats.latest?.vinV !== null && psuStats.latest?.vinV !== undefined
                  ? `${psuStats.latest.vinV} V`
                  : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {psuStats.vinMinV ?? '—'}..{psuStats.vinMaxV ?? '—'}V (Δ{' '}
                {psuStats.vinDeltaV ?? '—'}V)
              </div>
            </div>

            <div className="p-3 rounded bg-[#0B0E17] border border-slate-800">
              <div className="text-slate-400">Vout DC & Ripple</div>
              <div className="text-base font-bold text-cyan-400 mt-1">
                {psuStats.latest?.voutMv !== null && psuStats.latest?.voutMv !== undefined
                  ? `${psuStats.latest.voutMv} mV`
                  : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Ripple: {psuStats.voutRippleMv !== null ? `${psuStats.voutRippleMv} mV` : '—'}
              </div>
            </div>

            <div className="p-3 rounded bg-[#0B0E17] border border-slate-800">
              <div className="text-slate-400">Iout DC / Pin Power</div>
              <div className="text-base font-bold text-white mt-1">
                {psuStats.latest?.ioutA !== null && psuStats.latest?.ioutA !== undefined
                  ? `${psuStats.latest.ioutA} A`
                  : '—'}{' '}
                ·{' '}
                {psuStats.latest?.pinW !== null && psuStats.latest?.pinW !== undefined
                  ? `${psuStats.latest.pinW} W`
                  : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Peak: {psuStats.ioutMaxA ?? '—'}A / {psuStats.pinMaxW ?? '—'}W
              </div>
            </div>

            <div className="p-3 rounded bg-[#0B0E17] border border-slate-800">
              <div className="text-slate-400">Temps (T0/T1/T2) & Fan</div>
              <div className="text-base font-bold text-white mt-1">
                {psuStats.latest
                  ? `${psuStats.latest.temp0C ?? '—'}/${psuStats.latest.temp1C ?? '—'}/${
                      psuStats.latest.temp2C ?? '—'
                    } °C`
                  : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Fan: {psuStats.latest?.fanRpm ?? '—'} RPM
              </div>
            </div>
          </div>

          {/* Direct Paste of Real get_psu JSON or UART Voltage Log */}
          <form onSubmit={handleParseRawPsuLog} className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">
                {isRtl
                  ? 'ورود مستقیم پاسخ JSON دستور get_psu یا لاگ ولتاژ پاور جهت ترسیم نمودار:'
                  : 'Import Real get_psu JSON or Multi-Line PSU Log:'}
              </span>
              <button
                type="submit"
                className="px-3 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                {isRtl ? 'افزودن به نمودار نوسان' : 'Plot Real PSU Data'}
              </button>
            </div>
            <textarea
              rows={2}
              dir="ltr"
              value={rawPsuInput}
              onChange={(e) => setRawPsuInput(e.target.value)}
              placeholder={`Paste real get_psu JSON or UART lines, e.g.:\n{"STATUS":"S","Msg":{"name":"P221B","serial_no":"PSU2309A881","vin":"221.5","vout":"13680","iout":"244.2","pin":"3385","fan_speed":"5420","temp0":"58.5","temp1":"64.0","temp2":"55.0","error_code":"0"}}`}
              className="w-full p-2.5 rounded bg-[#0B0E17] border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
            />
          </form>
        </div>
      </div>

      {/* Multi-Channel SVG Oscilloscope / Time-Series Chart */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">
              {isRtl
                ? 'اسیلوسکوپ زمانی نوسان برق ورودی، ولتاژ DC خروجی و رفتار مرحله Upfreq'
                : 'Real-Time Multi-Channel PSU Waveform & Upfreq Correlation Chart'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {isRtl
                ? 'نشانگر موس را روی نقاط نمودار ببرید تا مقادیر دقیق همان ثانیه نمایش داده شود.'
                : 'Hover over any recorded sample point to inspect exact timestamped telemetry.'}
            </p>
          </div>

          {/* Interactive Channel Selector */}
          <div className="flex items-center gap-1 p-1 bg-[#0B0E17] border border-slate-800 rounded-md text-xs">
            <button
              type="button"
              onClick={() => setChartMode('VOLTAGE')}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                chartMode === 'VOLTAGE'
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isRtl ? 'ولتاژها (Vin AC + Vout mV)' : 'Voltages (Vin + Vout)'}
            </button>
            <button
              type="button"
              onClick={() => setChartMode('CURRENT_POWER')}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                chartMode === 'CURRENT_POWER'
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isRtl ? 'جریان و توان (Iout A + Pin W)' : 'Current & Power'}
            </button>
            <button
              type="button"
              onClick={() => setChartMode('TEMP_FREQ')}
              className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                chartMode === 'TEMP_FREQ'
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {isRtl ? 'دما و فرکانس (Temp + Freq)' : 'PSU Temp & Freq'}
            </button>
          </div>
        </div>

        {/* SVG Plotter */}
        <div className="p-4 rounded bg-[#0B0E17] border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-4">
              <span className="text-cyan-400">● {svgChartData.labelA || 'Channel A'}</span>
              <span className="text-emerald-400">● {svgChartData.labelB || 'Channel B'}</span>
            </div>
            {hoveredSample && (
              <div className="text-slate-300">
                [{hoveredSample.timestamp}] Vin: {hoveredSample.vinV ?? '—'}V · Vout:{' '}
                {hoveredSample.voutMv ?? '—'}mV · Iout: {hoveredSample.ioutA ?? '—'}A · Pin:{' '}
                {hoveredSample.pinW ?? '—'}W · Freq: {hoveredSample.minerFreqMhz ?? '—'}MHz
              </div>
            )}
          </div>

          {samples.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-500 font-mono">
              {isRtl
                ? 'نمودار خالی است — نمونه‌برداری زنده پورت 4028 را آغاز کنید یا پاسخ واقعی get_psu را وارد نمایید.'
                : 'No samples recorded yet — start live TCP 4028 polling or paste real get_psu telemetry.'}
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${svgChartData.W} ${svgChartData.H}`}
              className="w-full h-56 overflow-visible"
            >
              {/* Horizontal Grid Lines */}
              {[0.2, 0.5, 0.8].map((ratio, i) => (
                <line
                  key={i}
                  x1={48}
                  x2={svgChartData.W - 48}
                  y1={24 + ratio * (svgChartData.H - 48)}
                  y2={24 + ratio * (svgChartData.H - 48)}
                  stroke="#1E293B"
                  strokeDasharray="4 4"
                />
              ))}

              {/* Trace A (Cyan) */}
              {svgChartData.traceA && (
                <path
                  d={svgChartData.traceA}
                  fill="none"
                  stroke="#22D3EE"
                  strokeWidth="2.2"
                />
              )}

              {/* Trace B (Emerald) */}
              {svgChartData.traceB && (
                <path
                  d={svgChartData.traceB}
                  fill="none"
                  stroke="#34D399"
                  strokeWidth="2.2"
                />
              )}

              {/* Interactive Sample Points */}
              {svgChartData.pointsA.map((pt) => (
                <circle
                  key={`a-${pt.idx}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={hoverIndex === pt.idx ? 5 : 3}
                  fill="#22D3EE"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverIndex(pt.idx)}
                />
              ))}
              {svgChartData.pointsB.map((pt) => (
                <circle
                  key={`b-${pt.idx}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={hoverIndex === pt.idx ? 5 : 3}
                  fill="#34D399"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverIndex(pt.idx)}
                />
              ))}
            </svg>
          )}
        </div>
      </div>

      {/* Bottom Row: Detected Hardware Anomalies & Saved PSU Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">
            {isRtl
              ? `رویدادهای نوسان و خطاهای ثبت‌شده پاور (${anomalies.length} مورد)`
              : `Detected PSU Fluctuation & Threshold Anomalies (${anomalies.length})`}
          </h3>

          <div className="divide-y divide-slate-800 max-h-64 overflow-y-auto text-xs">
            {anomalies.length === 0 ? (
              <div className="py-6 text-center text-slate-500">
                {isRtl
                  ? 'هیچ نوسان غیرمجاز یا خطای ولتاژی در نمونه‌های فعلی ثبت نشده است.'
                  : 'No voltage sags, ripple violations, or thermal anomalies detected.'}
              </div>
            ) : (
              anomalies.map((anom) => (
                <div key={anom.id} className="py-2.5 space-y-1">
                  <div className="flex items-center justify-between font-mono">
                    <span
                      className={
                        anom.severity === 'CRITICAL'
                          ? 'text-rose-400 font-bold'
                          : 'text-amber-400 font-semibold'
                      }
                    >
                      [{anom.timestamp}] {anom.type} — {anom.measuredValue}
                    </span>
                    <span className="text-slate-500">{anom.thresholdInfo}</span>
                  </div>
                  <p className="text-slate-300">
                    {isRtl ? anom.descriptionFa : anom.descriptionEn}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Saved PSU Sessions on Disk */}
        <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">
            {isRtl
              ? `آرشیو تست‌های نوسان پاور در دیسک (setting/psu_sessions.json — ${savedSessions.length} مورد)`
              : `Saved PSU Test Sessions on Disk (${savedSessions.length})`}
          </h3>

          <div className="divide-y divide-slate-800 max-h-64 overflow-y-auto text-xs">
            {savedSessions.length === 0 ? (
              <div className="py-6 text-center text-slate-500">
                {isRtl
                  ? 'هنوز نشست تست پاوری روی دیسک ذخیره نشده است.'
                  : 'No saved PSU test sessions on disk yet.'}
              </div>
            ) : (
              savedSessions.map((sess) => (
                <div key={sess.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-white font-mono">
                      {sess.targetIp} · {sess.psuModel || 'PSU'} (SN: {sess.psuSerialNo || '—'})
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      {sess.sampleCount} samples · Vin: {sess.stats?.vinMinV ?? '—'}..
                      {sess.stats?.vinMaxV ?? '—'}V · Ripple: {sess.stats?.voutRippleMv ?? '—'}mV ·{' '}
                      {sess.stats?.verdict}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (Array.isArray(sess.samples)) {
                          setSamples(sess.samples);
                          setAnomalies(sess.anomalies || []);
                          setTargetIp(sess.targetIp || targetIp);
                          notify(
                            'info',
                            isRtl
                              ? `نشست تست پاور ${sess.psuSerialNo || sess.targetIp} بارگذاری شد.`
                              : `Loaded PSU session ${sess.psuSerialNo || sess.targetIp}.`
                          );
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 cursor-pointer"
                    >
                      {isRtl ? 'بارگذاری روی نمودار' : 'Load'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await fetch(`/api/psu/sessions/${sess.id}`, {
                          method: 'DELETE',
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setSavedSessions(data.sessions || []);
                        }
                      }}
                      className="text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
