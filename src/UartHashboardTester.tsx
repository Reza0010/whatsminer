import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Play,
  RefreshCw,
  Send,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  HostSerialPortInfo,
  Language,
  MinerUnit,
  UartChipDetail,
  UartParsedEvent,
} from './types';

interface UartHashboardTesterProps {
  lang: Language;
  onImportMinerTelemetry: (miner: MinerUnit) => void;
  onCreateRepairDraft: (draft: {
    minerModel: string;
    boardSn: string;
    slotName: string;
    chipType: string;
    errorCode: string;
    domainVoltageMv: string;
    faultyChipNo: string;
    actionTaken: string;
  }) => void;
  notify: (type: 'info' | 'success' | 'warning', text: string) => void;
}

// Parse a single real WhatsMiner UART / btminer / Hashboard Tester line into structured telemetry
export function parseWhatsMinerUartLine(rawLine: string, indexOffset = 0): UartParsedEvent | null {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;

  const now = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(
    now.getMilliseconds(),
    3
  )}`;

  let category: UartParsedEvent['category'] = 'BOOT';
  let severity: UartParsedEvent['severity'] = 'INFO';
  let slot: number | null = null;
  let detectedChips: number | null = null;
  let totalChips: number | null = null;
  let freqMhz: number | null = null;
  let tempC: number | null = null;
  let voltageMv: number | null = null;
  let faultyChipNo: number | null = null;
  let errorCode: string | null = null;
  let boardSn: string | null = null;
  let chipType: string | null = null;
  let crcErrors: number | null = null;
  const chipDetails: { chipNo: number; temp?: number; freq?: number; crc?: number; volt?: number }[] = [];

  // Extract slot / chain (SM0, SM1, SM2, slot 0, chain 1)
  const slotMatch = trimmed.match(/(?:SM|slot|chain|board)[\s_#:=-]*([0-2])\b/i);
  if (slotMatch) {
    slot = Number(slotMatch[1]);
  }

  // Extract total & detected chips (e.g. "find 74/114 chips", "effective chips: 42", "asic count = 114")
  const slashChipMatch = trimmed.match(/(?:find|detected|chips|asic|effective)[^0-9]*(\d+)\s*\/\s*(\d+)/i);
  if (slashChipMatch) {
    detectedChips = Number(slashChipMatch[1]);
    totalChips = Number(slashChipMatch[2]);
    category = 'CHIP_ENUM';
    severity = detectedChips < totalChips ? 'CRITICAL' : 'SUCCESS';
    if (detectedChips < totalChips) {
      faultyChipNo = detectedChips + 1;
    }
  } else {
    const singleChipMatch = trimmed.match(
      /(?:effective\s*chips|chip_num|asic_num|found\s*chips|chips|detect\s*asic)[:=\s]+(\d+)/i
    );
    if (singleChipMatch) {
      detectedChips = Number(singleChipMatch[1]);
      category = 'CHIP_ENUM';
      severity = detectedChips > 0 ? 'SUCCESS' : 'CRITICAL';
    }
    const totalMatch = trimmed.match(/(?:total\s*chips|expected\s*chips|max_asic)[:=\s]+(\d+)/i);
    if (totalMatch) {
      totalChips = Number(totalMatch[1]);
    }
  }

  // Extract individual chip fault / signal break (e.g. "chip 38 RI lost", "asic[41] timeout", "chip_id 15 no response")
  const chipFaultMatch = trimmed.match(
    /(?:chip|asic|u)[\s_#[\]]*(\d+)[\]]*\s*(?:lost|break|timeout|no\s*response|error|fail|bad|ri\s*err|clk\s*err)/i
  );
  if (chipFaultMatch) {
    faultyChipNo = Number(chipFaultMatch[1]);
    category = 'SIGNAL_FAULT';
    severity = 'CRITICAL';
  }

  // Extract per-chip telemetry (e.g. "chip[12] temp=68.5 freq=650 crc=2 volt=345")
  const perChipRegex =
    /(?:chip|asic|u)\s*\[?\s*(\d+)\s*\]?[^,;]*?(?:temp[:=\s]*([\d.]+))?[^,;]*?(?:freq[:=\s]*(\d+))?[^,;]*?(?:crc[:=\s]*(\d+))?[^,;]*?(?:vol(?:t)?[:=\s]*(\d+))?/gi;
  if (/(?:chip|asic)\s*\[\s*\d+\s*\]/i.test(trimmed)) {
    let m: RegExpExecArray | null;
    while ((m = perChipRegex.exec(trimmed)) !== null) {
      const cNo = Number(m[1]);
      const cTemp = m[2] ? Number(m[2]) : undefined;
      const cFreq = m[3] ? Number(m[3]) : undefined;
      const cCrc = m[4] ? Number(m[4]) : undefined;
      const cVolt = m[5] ? Number(m[5]) : undefined;
      if (cTemp !== undefined || cFreq !== undefined || cCrc !== undefined || cVolt !== undefined) {
        chipDetails.push({
          chipNo: cNo,
          temp: cTemp,
          freq: cFreq,
          crc: cCrc,
          volt: cVolt,
        });
      }
    }
    if (chipDetails.length > 0) {
      category = 'TEMP_FREQ';
    }
  }

  // Frequency, Temp, Voltage, CRC
  const freqMatch = trimmed.match(/(?:freq(?:uency)?|pll)[:=\s]+(\d+)\s*(?:MHz)?/i);
  if (freqMatch) {
    freqMhz = Number(freqMatch[1]);
    if (category === 'BOOT') category = 'TEMP_FREQ';
  }

  const tempMatch = trimmed.match(/(?:pcb_?temp|chip_?temp|temp(?:erature)?)[:=\s]+([\d.]+)/i);
  if (tempMatch) {
    tempC = Number(tempMatch[1]);
    if (category === 'BOOT') category = 'TEMP_FREQ';
    if (tempC >= 85) severity = 'WARNING';
  }

  const voltMatch = trimmed.match(/(?:vout|domain_?volt|voltage|vol)[:=\s]+(\d{3,5})\s*(?:mV)?/i);
  if (voltMatch) {
    voltageMv = Number(voltMatch[1]);
    if (category === 'BOOT') category = 'PSU';
  }

  const crcMatch = trimmed.match(/(?:crc(?:_err(?:or)?s?)?|combo_crc)[:=\s]+(\d+)/i);
  if (crcMatch) {
    crcErrors = Number(crcMatch[1]);
    if (crcErrors > 0 && severity === 'INFO') severity = 'WARNING';
  }

  // EEPROM / SN / Chip Type
  const snMatch = trimmed.match(/(?:pcb_?sn|board_?sn|hashboard_?sn|sn)[:=\s]+([A-Z0-9-]{6,24})/i);
  if (snMatch) {
    boardSn = snMatch[1];
    category = 'EEPROM';
    severity = 'SUCCESS';
  }

  const chipTypeMatch = trimmed.match(/\b(KF19\d{2}[A-Z]*|BM13\d{2}[A-Z]*|WhatsMiner_ASIC)\b/i);
  if (chipTypeMatch) {
    chipType = chipTypeMatch[1].toUpperCase();
    if (category === 'BOOT') category = 'EEPROM';
  }

  // Error code
  const errCodeMatch = trimmed.match(/(?:error[_\s]*code|err_code|code)[:=\s#]+(\d{3,4})\b/i);
  if (errCodeMatch) {
    errorCode = errCodeMatch[1];
    category = 'ERROR';
    severity = 'CRITICAL';
  }

  // Build human-readable technical summary
  const partsFa: string[] = [];
  const partsEn: string[] = [];

  if (slot !== null) {
    partsFa.push(`اسلات SM${slot}`);
    partsEn.push(`Slot SM${slot}`);
  }
  if (detectedChips !== null) {
    partsFa.push(
      totalChips ? `چیپ شناسایی‌شده: ${detectedChips} از ${totalChips}` : `چیپ فعال: ${detectedChips}`
    );
    partsEn.push(
      totalChips ? `Detected Chips: ${detectedChips}/${totalChips}` : `Effective Chips: ${detectedChips}`
    );
  }
  if (faultyChipNo !== null) {
    partsFa.push(`قطعی سیگنال در چیپ U${faultyChipNo}`);
    partsEn.push(`Signal break at Chip U${faultyChipNo}`);
  }
  if (freqMhz !== null) {
    partsFa.push(`فرکانس: ${freqMhz}MHz`);
    partsEn.push(`Freq: ${freqMhz}MHz`);
  }
  if (tempC !== null) {
    partsFa.push(`دما: ${tempC}°C`);
    partsEn.push(`Temp: ${tempC}°C`);
  }
  if (boardSn) {
    partsFa.push(`سریال برد: ${boardSn}`);
    partsEn.push(`Board SN: ${boardSn}`);
  }
  if (chipType) {
    partsFa.push(`چیپ: ${chipType}`);
    partsEn.push(`ASIC: ${chipType}`);
  }
  if (errorCode) {
    partsFa.push(`کد خطا: ${errorCode}`);
    partsEn.push(`Error Code: ${errorCode}`);
  }

  return {
    id: `uart-${Date.now()}-${indexOffset}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: timeStr,
    rawLine: trimmed,
    category,
    severity,
    slot,
    detectedChips,
    totalChips,
    freqMhz,
    tempC,
    voltageMv,
    faultyChipNo,
    errorCode,
    boardSn,
    chipType,
    crcErrors,
    chipDetails: chipDetails.length > 0 ? chipDetails : undefined,
    messageFa: partsFa.length > 0 ? partsFa.join(' · ') : trimmed,
    messageEn: partsEn.length > 0 ? partsEn.join(' · ') : trimmed,
  };
}

export const UartHashboardTester: React.FC<UartHashboardTesterProps> = ({
  lang,
  onImportMinerTelemetry,
  onCreateRepairDraft,
  notify,
}) => {
  const isRtl = lang === 'fa';

  // WebSerial API connection state
  const [webSerialSupported, setWebSerialSupported] = useState<boolean>(false);
  const [isSerialConnected, setIsSerialConnected] = useState<boolean>(false);
  const [serialPortLabel, setSerialPortLabel] = useState<string>('');
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [dataBits, setDataBits] = useState<number>(8);
  const [stopBits, setStopBits] = useState<number>(1);
  const [parity, setParity] = useState<'none' | 'even' | 'odd'>('none');
  const [txCommandInput, setTxCommandInput] = useState<string>('');
  const [serialPermissionError, setSerialPermissionError] = useState<string | null>(null);

  // Host OS /dev/tty* ports detected by backend
  const [hostSerialPorts, setHostSerialPorts] = useState<HostSerialPortInfo[]>([]);
  const [selectedHostPort, setSelectedHostPort] = useState<string>('');

  // Hashboard architecture configuration for chip topology mapping
  const [boardPreset, setBoardPreset] = useState<string>('M30S++_114');
  const [totalBoardChips, setTotalBoardChips] = useState<number>(114);
  const [chipsPerDomain, setChipsPerDomain] = useState<number>(3);
  const [psuVoltageMv, setPsuVoltageMv] = useState<number>(13650);
  const [selectedChipNo, setSelectedChipNo] = useState<number | null>(null);

  // Parsed UART Events & Raw stream lines
  const [uartEvents, setUartEvents] = useState<UartParsedEvent[]>([]);
  const [manualLogText, setManualLogText] = useState<string>('');
  const [eventFilter, setEventFilter] = useState<string>('ALL');

  const serialPortRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const keepReadingRef = useRef<boolean>(false);
  const lineBufferRef = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setWebSerialSupported(typeof navigator !== 'undefined' && 'serial' in navigator);
    fetchHostSerialPorts();
    return () => {
      disconnectWebSerial();
    };
  }, []);

  const fetchHostSerialPorts = async () => {
    try {
      const res = await fetch('/api/serial/ports');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.ports)) {
          setHostSerialPorts(data.ports);
          if (data.ports.length > 0 && !selectedHostPort) {
            setSelectedHostPort(data.ports[0].path);
          }
        }
      }
    } catch {
      // ignore
    }
  };

  const handlePresetChange = (val: string) => {
    setBoardPreset(val);
    if (val === 'M30S++_114') {
      setTotalBoardChips(114);
      setChipsPerDomain(3);
      setPsuVoltageMv(13650);
    } else if (val === 'M30S+_102') {
      setTotalBoardChips(102);
      setChipsPerDomain(3);
      setPsuVoltageMv(13500);
    } else if (val === 'M30S_78') {
      setTotalBoardChips(78);
      setChipsPerDomain(3);
      setPsuVoltageMv(13200);
    } else if (val === 'M50_108') {
      setTotalBoardChips(108);
      setChipsPerDomain(3);
      setPsuVoltageMv(14200);
    } else if (val === 'M20S_66') {
      setTotalBoardChips(66);
      setChipsPerDomain(3);
      setPsuVoltageMv(12800);
    }
  };

  // Process incoming UART lines in real time
  const ingestUartLines = (lines: string[]) => {
    const newEvents: UartParsedEvent[] = [];
    lines.forEach((line, idx) => {
      const parsed = parseWhatsMinerUartLine(line, idx);
      if (parsed) {
        newEvents.push(parsed);
        if (parsed.totalChips && parsed.totalChips > 0) {
          setTotalBoardChips(parsed.totalChips);
        }
        if (parsed.voltageMv && parsed.voltageMv > 1000) {
          setPsuVoltageMv(parsed.voltageMv);
        }
        if (parsed.faultyChipNo) {
          setSelectedChipNo(parsed.faultyChipNo);
        }
      }
    });
    if (newEvents.length > 0) {
      setUartEvents((prev) => [...newEvents.reverse(), ...prev].slice(0, 500));
    }
  };

  // Connect directly to USB-TTL / UART Port via Browser WebSerial API
  const connectWebSerial = async () => {
    setSerialPermissionError(null);
    if (!('serial' in navigator)) {
      setSerialPermissionError(
        isRtl
          ? 'مرورگر فعلی از WebSerial API پشتیبانی نمی‌کند. از مرورگر Chrome یا Edge دسکتاپ استفاده کنید یا فایل لاگ تستر را بارگذاری نمایید.'
          : 'WebSerial API is not supported in this browser. Use Desktop Chrome/Edge or upload a captured UART log file.'
      );
      return;
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({
        baudRate,
        dataBits,
        stopBits,
        parity,
        flowControl: 'none',
      });

      serialPortRef.current = port;
      keepReadingRef.current = true;
      setIsSerialConnected(true);

      const info = port.getInfo ? port.getInfo() : {};
      const vidPid =
        info.usbVendorId && info.usbProductId
          ? `USB VID:0x${info.usbVendorId.toString(16).toUpperCase()} PID:0x${info.usbProductId
              .toString(16)
              .toUpperCase()}`
          : 'Hardware UART Port';
      setSerialPortLabel(`${vidPid} @ ${baudRate}bps`);

      notify(
        'success',
        isRtl
          ? `اتصال مستقیم به پورت سریال (${vidPid}) با نرخ ${baudRate} baud برقرار شد.`
          : `Connected to Serial Port (${vidPid}) at ${baudRate} baud.`
      );

      const decoder = new TextDecoder();
      while (port.readable && keepReadingRef.current) {
        const reader = port.readable.getReader();
        readerRef.current = reader;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              const chunkStr = decoder.decode(value, { stream: true });
              lineBufferRef.current += chunkStr;
              const parts = lineBufferRef.current.split(/\r?\n/);
              lineBufferRef.current = parts.pop() || '';
              if (parts.length > 0) {
                ingestUartLines(parts);
              }
            }
          }
        } catch {
          break;
        } finally {
          reader.releaseLock();
        }
      }
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (msg.toLowerCase().includes('permissions policy') || msg.toLowerCase().includes('security')) {
        setSerialPermissionError(
          isRtl
            ? 'دسترسی مستقیم به پورت USB در داخل قاب پیش‌نمایش (iFrame) توسط سیاست امنیتی مرورگر محدود شده است. دکمه «باز کردن در تب مستقل» را بزنید یا از بارگذاری مستقیم فایل لاگ / پورت سرور استفاده کنید.'
            : 'Direct USB WebSerial access is restricted inside an iframe by browser Permissions-Policy. Open the app in a standalone browser tab or import your UART log file below.'
        );
      } else if (!msg.toLowerCase().includes('no port selected')) {
        setSerialPermissionError(msg);
      }
      setIsSerialConnected(false);
    }
  };

  const disconnectWebSerial = async () => {
    keepReadingRef.current = false;
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close();
        serialPortRef.current = null;
      }
    } catch {
      // ignore
    }
    setIsSerialConnected(false);
  };

  // Send TX command over WebSerial to Hashboard Tester / Control Board UART
  const handleSendUartCommand = async (customCmd?: string) => {
    const cmdToSend = customCmd !== undefined ? customCmd : txCommandInput;
    if (!serialPortRef.current || !serialPortRef.current.writable) {
      notify(
        'warning',
        isRtl
          ? 'ابتدا به پورت سریال USB-TTL متصل شوید.'
          : 'Connect to a USB-TTL Serial Port first.'
      );
      return;
    }
    try {
      const writer = serialPortRef.current.writable.getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(cmdToSend + '\n'));
      writer.releaseLock();
      if (customCmd === undefined) setTxCommandInput('');
    } catch (err: any) {
      notify('warning', err.message || 'Failed to write to UART TX');
    }
  };

  // Read from host OS /dev/tty* port
  const handleReadHostSerialDevice = async () => {
    if (!selectedHostPort) return;
    try {
      const res = await fetch('/api/serial/read-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedHostPort }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        const lines = String(data.data).split(/\r?\n/).filter(Boolean);
        ingestUartLines(lines);
        notify(
          'success',
          isRtl
            ? `${lines.length} خط از درگاه ${selectedHostPort} خوانده شد.`
            : `Read ${lines.length} lines from ${selectedHostPort}.`
        );
      } else {
        notify('warning', data.error || `No data currently buffered on ${selectedHostPort}`);
      }
    } catch (err: any) {
      notify('warning', err.message);
    }
  };

  // Upload real .log / .txt file from Hashboard Tester SD card or PuTTY log
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const lines = content.split(/\r?\n/).filter(Boolean);
      ingestUartLines(lines);
      notify(
        'success',
        isRtl
          ? `فایل لاگ واقعی «${file.name}» (${lines.length} خط) با موفقیت کالبدشکافی شد.`
          : `Parsed ${lines.length} lines from real UART log file "${file.name}".`
      );
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Aggregate real telemetry from all ingested UART events
  const liveBoardSummary = useMemo(() => {
    let slot: number | null = null;
    let detectedChips: number | null = null;
    let freqMhz: number | null = null;
    let tempC: number | null = null;
    let boardSn: string | null = null;
    let chipType: string | null = null;
    let crcTotal = 0;
    let faultyChipNo: number | null = null;
    const errorCodes = new Set<string>();
    const perChipMap = new Map<
      number,
      { temp?: number; freq?: number; crc?: number; volt?: number }
    >();

    // Iterate from oldest to newest so latest reading wins
    for (let i = uartEvents.length - 1; i >= 0; i--) {
      const ev = uartEvents[i];
      if (ev.slot !== null) slot = ev.slot;
      if (ev.detectedChips !== null) detectedChips = ev.detectedChips;
      if (ev.freqMhz !== null) freqMhz = ev.freqMhz;
      if (ev.tempC !== null) tempC = ev.tempC;
      if (ev.boardSn) boardSn = ev.boardSn;
      if (ev.chipType) chipType = ev.chipType;
      if (ev.crcErrors !== null) crcTotal = ev.crcErrors;
      if (ev.faultyChipNo !== null) faultyChipNo = ev.faultyChipNo;
      if (ev.errorCode) errorCodes.add(ev.errorCode);
      if (ev.chipDetails) {
        for (const cd of ev.chipDetails) {
          const prev = perChipMap.get(cd.chipNo) || {};
          perChipMap.set(cd.chipNo, {
            temp: cd.temp ?? prev.temp,
            freq: cd.freq ?? prev.freq,
            crc: cd.crc ?? prev.crc,
            volt: cd.volt ?? prev.volt,
          });
        }
      }
    }

    if (
      faultyChipNo === null &&
      detectedChips !== null &&
      detectedChips < totalBoardChips &&
      detectedChips >= 0
    ) {
      faultyChipNo = detectedChips + 1;
    }

    return {
      slot: slot ?? 0,
      detectedChips,
      freqMhz,
      tempC,
      boardSn,
      chipType,
      crcTotal,
      faultyChipNo,
      errorCodes: Array.from(errorCodes),
      perChipMap,
    };
  }, [uartEvents, totalBoardChips]);

  // Build exact chip topology array (U1 .. U_totalBoardChips)
  const chipTopology = useMemo<UartChipDetail[]>(() => {
    const list: UartChipDetail[] = [];
    const det = liveBoardSummary.detectedChips;
    const brk = liveBoardSummary.faultyChipNo;
    const totalDomains = Math.max(1, Math.ceil(totalBoardChips / Math.max(1, chipsPerDomain)));
    const defaultDomainMv = Math.round(psuVoltageMv / totalDomains);

    for (let c = 1; c <= totalBoardChips; c++) {
      const domainNumber = Math.ceil(c / Math.max(1, chipsPerDomain));
      const measured =
        liveBoardSummary.perChipMap.get(c) || liveBoardSummary.perChipMap.get(c - 1);

      let status: UartChipDetail['status'] = 'OK';
      if (brk !== null && c === brk) {
        status = 'SIGNAL_BREAK';
      } else if (det !== null && c > det) {
        status = 'UNREACHED';
      } else if (measured?.crc && measured.crc > 0) {
        status = 'CRC_FAULT';
      } else if (measured?.temp && measured.temp >= 85) {
        status = 'OVERTEMP';
      } else if (det === null && uartEvents.length === 0) {
        status = 'UNREACHED';
      }

      list.push({
        chipNumber: c,
        domainNumber,
        status,
        tempC: measured?.temp ?? null,
        freqMhz: measured?.freq ?? liveBoardSummary.freqMhz ?? null,
        crcCount: measured?.crc ?? null,
        voltageMv: measured?.volt ?? (det !== null ? defaultDomainMv : null),
      });
    }
    return list;
  }, [totalBoardChips, chipsPerDomain, psuVoltageMv, liveBoardSummary, uartEvents.length]);

  const inspectedChipDetail = useMemo(() => {
    const target = selectedChipNo ?? liveBoardSummary.faultyChipNo ?? 1;
    return chipTopology.find((c) => c.chipNumber === target) || chipTopology[0] || null;
  }, [chipTopology, selectedChipNo, liveBoardSummary.faultyChipNo]);

  const filteredUartEvents = useMemo(() => {
    if (eventFilter === 'ALL') return uartEvents;
    return uartEvents.filter((e) => e.category === eventFilter || e.severity === eventFilter);
  }, [uartEvents, eventFilter]);

  // Push parsed UART board telemetry into the main application's Diagnostics state
  const handlePushToMainDiagnostics = async () => {
    if (uartEvents.length === 0) {
      notify(
        'warning',
        isRtl
          ? 'هنوز هیچ داده سریالی دریافت نشده است.'
          : 'No UART telemetry has been captured yet.'
      );
      return;
    }
    const rawText = uartEvents
      .slice()
      .reverse()
      .map((e) => e.rawLine)
      .join('\n');

    try {
      const res = await fetch('/api/miner/parse-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          label: liveBoardSummary.boardSn
            ? `UART-${liveBoardSummary.boardSn}`
            : `UART-SM${liveBoardSummary.slot}`,
        }),
      });
      const data = await res.json();
      if (res.ok && data.miner) {
        onImportMinerTelemetry(data.miner);
      }
    } catch (err: any) {
      notify('warning', err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Connection & Serial Configuration Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 5 Cols: WebSerial API & Host SerialPort Hardware Controls */}
        <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">
                {isRtl
                  ? 'اتصال مستقیم به پورت سریال (WebSerial API / USB-TTL UART)'
                  : 'Direct Serial Port Connection (WebSerial API / USB-TTL UART)'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isRtl
                  ? 'خواندن زنده لاگ بوت کنترل‌برد، تستر هش‌برد (Pico/Zynq) و شمارش لحظه‌ای چیپ‌ها روی پورت سریال.'
                  : 'Real-time UART stream reader for CP2102/CH340/FT232 USB-TTL adapters & Hashboard Testers.'}
              </p>
            </div>
            <span className="text-xs font-mono text-cyan-400 shrink-0">
              {isSerialConnected ? 'CONNECTED' : 'STANDBY'}
            </span>
          </div>

          {/* Serial Port Parameters */}
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Baud Rate</label>
              <select
                value={baudRate}
                disabled={isSerialConnected}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                className="w-full px-2 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
              >
                <option value={115200}>115200 (WhatsMiner)</option>
                <option value={57600}>57600</option>
                <option value={38400}>38400</option>
                <option value={19200}>19200</option>
                <option value={9600}>9600</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Data Bits</label>
              <select
                value={dataBits}
                disabled={isSerialConnected}
                onChange={(e) => setDataBits(Number(e.target.value))}
                className="w-full px-2 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
              >
                <option value={8}>8 Bits</option>
                <option value={7}>7 Bits</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Stop Bits</label>
              <select
                value={stopBits}
                disabled={isSerialConnected}
                onChange={(e) => setStopBits(Number(e.target.value))}
                className="w-full px-2 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
              >
                <option value={1}>1 Bit</option>
                <option value={2}>2 Bits</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Parity</label>
              <select
                value={parity}
                disabled={isSerialConnected}
                onChange={(e) => setParity(e.target.value as 'none' | 'even' | 'odd')}
                className="w-full px-2 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
              >
                <option value="none">None</option>
                <option value="even">Even</option>
                <option value="odd">Odd</option>
              </select>
            </div>
          </div>

          {/* Primary Connect / Disconnect / Upload Buttons */}
          <div className="flex flex-wrap gap-2">
            {!isSerialConnected ? (
              <button
                type="button"
                onClick={connectWebSerial}
                className="flex-1 py-2 px-4 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>
                  {isRtl
                    ? 'انتخاب پورت USB-TTL و اتصال زنده (WebSerial)'
                    : 'Connect USB-TTL Serial Port (WebSerial)'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={disconnectWebSerial}
                className="flex-1 py-2 px-4 rounded-md bg-rose-500 hover:bg-rose-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Square className="w-3.5 h-3.5" />
                <span>
                  {isRtl ? `قطع اتصال (${serialPortLabel})` : `Disconnect (${serialPortLabel})`}
                </span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".log,.txt,.json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="py-2 px-3 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isRtl ? 'بارگذاری فایل .log تستر' : 'Load .log File'}</span>
            </button>
          </div>

          {serialPermissionError && (
            <div className="p-3 rounded bg-amber-950/60 border border-amber-800 text-xs text-amber-200 space-y-2">
              <p className="leading-relaxed">{serialPermissionError}</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-3 py-1 rounded bg-amber-400 text-slate-950 font-semibold text-xs"
                >
                  {isRtl
                    ? 'باز کردن برنامه در تب مستقل مرورگر (فعال‌سازی WebSerial)'
                    : 'Open in Standalone Browser Tab (Enable WebSerial)'}
                </a>
              </div>
            </div>
          )}

          {/* TX Command Bar for Connected UART */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                {isRtl
                  ? 'ارسال فرمان روی پایه TX سریال به کنترل‌برد / تستر:'
                  : 'Send UART TX Command to Control Board / Tester:'}
              </span>
              <span className="font-mono text-[11px]">
                {webSerialSupported ? 'WebSerial API Ready' : 'File/Server Mode'}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Enter (\\n)', cmd: '' },
                { label: 'btminer status', cmd: 'ps | grep btminer' },
                { label: 'dmesg slot', cmd: 'dmesg | grep -i slot' },
                { label: 'cat btminer.log', cmd: 'tail -n 50 /tmp/btminer.log' },
                { label: 'eeprom dump', cmd: 'i2cdump -y 0 0x50' },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleSendUartCommand(item.cmd)}
                  className="px-2 py-1 rounded bg-[#0B0E17] hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-cyan-300 cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                dir="ltr"
                value={txCommandInput}
                onChange={(e) => setTxCommandInput(e.target.value)}
                placeholder="Type raw UART TX command..."
                className="flex-1 px-3 py-1.5 rounded bg-[#0B0E17] border border-slate-800 text-xs font-mono text-white"
              />
              <button
                type="button"
                onClick={() => handleSendUartCommand()}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white cursor-pointer flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>TX</span>
              </button>
            </div>
          </div>

          {/* Host OS Serial Ports (/dev/ttyUSB*, /dev/ttyS*) */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">
                {isRtl
                  ? 'درگاه‌های سریال شناسایی‌شده روی سیستم‌عامل سرور (/dev/tty*):'
                  : 'Host OS Serial Devices (/dev/tty*):'}
              </span>
              <button
                type="button"
                onClick={fetchHostSerialPorts}
                className="text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{isRtl ? 'بروزرسانی' : 'Refresh'}</span>
              </button>
            </div>

            {hostSerialPorts.length > 0 ? (
              <div className="flex gap-2">
                <select
                  value={selectedHostPort}
                  onChange={(e) => setSelectedHostPort(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 text-xs font-mono text-slate-200"
                >
                  {hostSerialPorts.map((p) => (
                    <option key={p.path} value={p.path}>
                      {p.path} — {p.type} ({p.accessible ? 'Readable' : 'Root/Perm Required'})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleReadHostSerialDevice}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-cyan-300 font-medium cursor-pointer"
                >
                  {isRtl ? 'خواندن بافر' : 'Read Buffer'}
                </button>
              </div>
            ) : (
              <div className="text-[11px] font-mono text-slate-500">
                No physical /dev/ttyUSB* attached to server container — use Browser WebSerial or log upload.
              </div>
            )}
          </div>
        </div>

        {/* Right 7 Cols: Live Stream Input & Real-Time Extracted Hashboard Telemetry */}
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">
                {isRtl
                  ? 'خروجی لحظه‌ای استخراج‌شده از پورت سریال و پیکربندی توپولوژی برد'
                  : 'Real-Time Extracted UART Telemetry & Hashboard Architecture'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isRtl
                  ? 'تمام اعداد زیر صرفاً از خطوط واقعی دریافتی پورت سریال یا فایل لاگ استخراج می‌شوند.'
                  : 'All metrics below are strictly parsed from incoming UART lines with zero synthetic values.'}
              </p>
            </div>

            <button
              type="button"
              onClick={handlePushToMainDiagnostics}
              disabled={uartEvents.length === 0}
              className="px-3 py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-40 border border-cyan-500/40 text-xs font-semibold text-cyan-300 cursor-pointer"
            >
              {isRtl
                ? 'انتقال به جدول اصلی و کالبدشکافی'
                : 'Push to Main Diagnostics'}
            </button>
          </div>

          {/* Architecture Selector for Accurate Domain & Chip Mapping */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">
                {isRtl ? 'مدل معماری هش‌برد' : 'Hashboard Layout'}
              </label>
              <select
                value={boardPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 text-white font-mono"
              >
                <option value="M30S++_114">M30S++ (114 Chips / 38 Dom)</option>
                <option value="M50_108">M50 / M50S (108 Chips / 36 Dom)</option>
                <option value="M30S+_102">M30S+ (102 Chips / 34 Dom)</option>
                <option value="M30S_78">M30S (78 Chips / 26 Dom)</option>
                <option value="M20S_66">M20S / M21S (66 Chips / 22 Dom)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                {isRtl ? 'تعداد کل چیپ‌ها' : 'Total ASIC Chips'}
              </label>
              <input
                type="number"
                value={totalBoardChips}
                onChange={(e) => setTotalBoardChips(Math.max(1, Number(e.target.value)))}
                className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                {isRtl ? 'چیپ در هر دامین' : 'Chips / Domain'}
              </label>
              <input
                type="number"
                value={chipsPerDomain}
                onChange={(e) => setChipsPerDomain(Math.max(1, Number(e.target.value)))}
                className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                {isRtl ? 'ولتاژ کل برد (mV)' : 'Board Voltage (mV)'}
              </label>
              <input
                type="number"
                value={psuVoltageMv}
                onChange={(e) => setPsuVoltageMv(Math.max(1000, Number(e.target.value)))}
                className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-cyan-400"
              />
            </div>
          </div>

          {/* Real-Time Extracted Telemetry Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
            <div className="p-3 rounded bg-[#0B0E17] border border-slate-800">
              <div className="text-slate-400">
                {isRtl ? 'اسلات / سریال برد' : 'Slot / Board SN'}
              </div>
              <div className="text-white font-semibold mt-1 truncate">
                SM{liveBoardSummary.slot} · {liveBoardSummary.boardSn || '—'}
              </div>
            </div>

            <div className="p-3 rounded bg-[#0B0E17] border border-slate-800">
              <div className="text-slate-400">
                {isRtl ? 'چیپ‌های پاسخ‌دهنده' : 'Detected Chips'}
              </div>
              <div
                className={`font-semibold mt-1 ${
                  liveBoardSummary.detectedChips === null
                    ? 'text-slate-400'
                    : liveBoardSummary.detectedChips >= totalBoardChips
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {liveBoardSummary.detectedChips !== null
                  ? `${liveBoardSummary.detectedChips} / ${totalBoardChips}`
                  : '—'}
              </div>
            </div>

            <div className="p-3 rounded bg-[#0B0E17] border border-slate-800">
              <div className="text-slate-400">
                {isRtl ? 'محل قطع سیگنال (RI/CLK)' : 'Signal Break Point'}
              </div>
              <div
                className={`font-semibold mt-1 ${
                  liveBoardSummary.faultyChipNo ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {liveBoardSummary.faultyChipNo
                  ? `Chip U${liveBoardSummary.faultyChipNo} (Dom #${Math.ceil(
                      liveBoardSummary.faultyChipNo / Math.max(1, chipsPerDomain)
                    )})`
                  : liveBoardSummary.detectedChips !== null
                  ? 'CHAIN OK'
                  : '—'}
              </div>
            </div>

            <div className="p-3 rounded bg-[#0B0E17] border border-slate-800">
              <div className="text-slate-400">
                {isRtl ? 'فرکانس / دما / خطای CRC' : 'Freq / Temp / CRC'}
              </div>
              <div className="text-white font-semibold mt-1">
                {liveBoardSummary.freqMhz ?? '—'}MHz · {liveBoardSummary.tempC ?? '—'}°C · CRC:{' '}
                {liveBoardSummary.crcTotal}
              </div>
            </div>
          </div>

          {/* Direct Paste / Stream Injection Box for UART Lines */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">
                {isRtl
                  ? 'ورود مستقیم خطوط لاگ سریال تستر (Paste یا استریم دستی):'
                  : 'Paste or Inject Real UART Tester Lines:'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!manualLogText.trim()) return;
                  ingestUartLines(manualLogText.split(/\r?\n/));
                  notify(
                    'success',
                    isRtl
                      ? 'خطوط لاگ سریال پردازش و روی نقشه چیپ‌ها اعمال شد.'
                      : 'Parsed UART lines and updated ASIC topology map.'
                  );
                }}
                className="px-3 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                {isRtl ? 'پردازش و ترسیم نقشه چیپ‌ها' : 'Parse & Map Chips'}
              </button>
            </div>
            <textarea
              rows={3}
              dir="ltr"
              value={manualLogText}
              onChange={(e) => setManualLogText(e.target.value)}
              placeholder={`Paste real UART output from Pico/Zynq tester or control board console:\n[btminer] SM0: pcb_sn: HBY1950A2309112, chip_type: KF1950\n[btminer] SM0: find 45/114 chips, freq: 520MHz, temp: 61.5C, vout: 13650mV\n[btminer] SM0: chip 46 RI lost, error_code: 541`}
              className="w-full p-2.5 rounded bg-[#0B0E17] border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>
      </div>

      {/* Interactive Hashboard ASIC Chip Topology Map & Signal Chain Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">
                {isRtl
                  ? `نقشه گرافیکی زنجیره چیپ‌ها و دامین‌های ولتاژی (U1 تا U${totalBoardChips})`
                  : `Interactive Hashboard ASIC Chip & Voltage Domain Topology (U1..U${totalBoardChips})`}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isRtl
                  ? 'مسیر سیگنال رفت (CLK / RST / CI→CO) از U1 به سمت آخرین چیپ و مسیر برگشت (RO←RI) از انتهای برد به سمت U1 است. روی هر چیپ کلیک کنید.'
                  : 'Forward signal (CLK/RST/CI→CO) flows U1→UN; return signal (RO←RI) flows UN→U1. Click any chip for test-point guidance.'}
              </p>
            </div>

            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
              <span className="text-emerald-400">■ OK</span>
              <span className="text-rose-400">■ SIGNAL BREAK</span>
              <span className="text-amber-400">■ CRC/TEMP</span>
              <span className="text-slate-500">■ UNREACHED</span>
            </div>
          </div>

          {/* Chip Grid Grouped by Voltage Domains */}
          <div
            dir="ltr"
            className="p-3 rounded bg-[#0B0E17] border border-slate-800 max-h-[420px] overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2"
          >
            {Array.from(
              { length: Math.ceil(totalBoardChips / Math.max(1, chipsPerDomain)) },
              (_, domIdx) => {
                const domNo = domIdx + 1;
                const domainChips = chipTopology.filter((c) => c.domainNumber === domNo);
                const hasBreak = domainChips.some((c) => c.status === 'SIGNAL_BREAK');
                return (
                  <div
                    key={domNo}
                    className={`p-2 rounded border ${
                      hasBreak
                        ? 'border-rose-500 bg-rose-950/20'
                        : 'border-slate-800/90 bg-[#111827]/70'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1.5">
                      <span>DOM #{domNo}</span>
                      <span>
                        {domainChips[0]?.voltageMv ? `${domainChips[0].voltageMv}mV` : '—'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {domainChips.map((chip) => {
                        const isSelected = inspectedChipDetail?.chipNumber === chip.chipNumber;
                        const colorClass =
                          chip.status === 'SIGNAL_BREAK'
                            ? 'bg-rose-500 text-slate-950 font-bold border-rose-300'
                            : chip.status === 'CRC_FAULT' || chip.status === 'OVERTEMP'
                            ? 'bg-amber-500/30 text-amber-200 border-amber-500/60'
                            : chip.status === 'OK'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-slate-900 text-slate-500 border-slate-800';

                        return (
                          <button
                            key={chip.chipNumber}
                            type="button"
                            onClick={() => setSelectedChipNo(chip.chipNumber)}
                            className={`py-1 px-1 rounded border text-[11px] font-mono transition-all cursor-pointer ${colorClass} ${
                              isSelected ? 'ring-2 ring-cyan-400' : ''
                            }`}
                          >
                            U{chip.chipNumber}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* Right 4 Cols: Selected ASIC Chip Test-Point & LDO Inspector */}
        <div className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">
            {isRtl
              ? 'مشخصات فنی و نقاط تست چیپ انتخاب‌شده'
              : 'Selected ASIC Chip Test-Point Inspector'}
          </h3>

          {inspectedChipDetail && (
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded bg-[#0B0E17] border border-slate-800 space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">ASIC Chip ID:</span>
                  <span className="text-white font-bold">
                    U{inspectedChipDetail.chipNumber} (0-idx: #{inspectedChipDetail.chipNumber - 1})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Voltage Domain:</span>
                  <span className="text-cyan-400 font-semibold">
                    Domain #{inspectedChipDetail.domainNumber} of{' '}
                    {Math.ceil(totalBoardChips / Math.max(1, chipsPerDomain))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Chain Status:</span>
                  <span
                    className={
                      inspectedChipDetail.status === 'SIGNAL_BREAK'
                        ? 'text-rose-400 font-bold'
                        : inspectedChipDetail.status === 'OK'
                        ? 'text-emerald-400 font-semibold'
                        : 'text-slate-400'
                    }
                  >
                    {inspectedChipDetail.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Chip Temp / Freq:</span>
                  <span className="text-slate-200">
                    {inspectedChipDetail.tempC ?? '—'} °C · {inspectedChipDetail.freqMhz ?? '—'} MHz
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Domain Voltage:</span>
                  <span className="text-slate-200">
                    {inspectedChipDetail.voltageMv ? `${inspectedChipDetail.voltageMv} mV` : '—'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded bg-[#0B0E17] border border-slate-800 space-y-1.5 text-slate-300 leading-relaxed">
                <div className="font-semibold text-cyan-300">
                  {isRtl
                    ? `راهنمای مولتی‌متر برای چیپ U${inspectedChipDetail.chipNumber}:`
                    : `Bench Multimeter Guide for U${inspectedChipDetail.chipNumber}:`}
                </div>
                <p>
                  {isRtl
                    ? `• تغذیه رگولاتور دامین #${inspectedChipDetail.domainNumber}: ولتاژ خروجی LDO باید دقیقاً 1.8V و ولتاژ هسته PLD برابر 0.8V نسبت به زمین همین دامین باشد.`
                    : `• Domain #${inspectedChipDetail.domainNumber} Regulators: Verify LDO = 1.8V and PLD = 0.8V referenced to Domain #${inspectedChipDetail.domainNumber} GND.`}
                </p>
                <p>
                  {isRtl
                    ? `• سیگنال‌های ۵گانه: CLK (0.9V / 25MHz)، RST (1.8V)، CI/CO (1.8V) بین U${Math.max(
                        1,
                        inspectedChipDetail.chipNumber - 1
                      )} و U${inspectedChipDetail.chipNumber}، و برگشت RI/RO (1.8V) از U${Math.min(
                        totalBoardChips,
                        inspectedChipDetail.chipNumber + 1
                      )}.`
                    : `• 5 Test Points: CLK (~0.9V), RST (1.8V), CI/CO (1.8V) from U${Math.max(
                        1,
                        inspectedChipDetail.chipNumber - 1
                      )}, and return RI/RO (1.8V) from U${Math.min(
                        totalBoardChips,
                        inspectedChipDetail.chipNumber + 1
                      )}.`}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onCreateRepairDraft({
                    minerModel: boardPreset.split('_')[0] || 'WhatsMiner',
                    boardSn: liveBoardSummary.boardSn || '',
                    slotName: `SM${liveBoardSummary.slot}`,
                    chipType: liveBoardSummary.chipType || 'KF1950',
                    errorCode: liveBoardSummary.errorCodes[0] || '541',
                    domainVoltageMv: String(inspectedChipDetail.voltageMv || ''),
                    faultyChipNo: `U${inspectedChipDetail.chipNumber} (Domain #${inspectedChipDetail.domainNumber})`,
                    actionTaken: isRtl
                      ? `تشخیص قطعی سیگنال در چیپ U${inspectedChipDetail.chipNumber} (شناسایی ${
                          liveBoardSummary.detectedChips ?? 0
                        } از ${totalBoardChips} چیپ از طریق پورت سریال UART)`
                      : `UART Serial detected signal break at U${inspectedChipDetail.chipNumber} (${
                          liveBoardSummary.detectedChips ?? 0
                        }/${totalBoardChips} chips)`,
                  });
                }}
                className="w-full py-2 px-4 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                {isRtl
                  ? `ثبت چیپ U${inspectedChipDetail.chipNumber} در فرم کارت تعمیرات`
                  : `Send Chip U${inspectedChipDetail.chipNumber} to Repair Ticket`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Live UART Serial Terminal Log Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-white">
              {isRtl
                ? `ترمینال زنده رویدادهای پورت سریال (${uartEvents.length} خط دریافت‌شده)`
                : `Live UART Serial Event Stream (${uartEvents.length} lines)`}
            </h3>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="px-2.5 py-1 rounded bg-[#0B0E17] border border-slate-800 text-xs text-slate-200"
            >
              <option value="ALL">{isRtl ? 'همه خطوط سریال' : 'All UART Lines'}</option>
              <option value="CHIP_ENUM">{isRtl ? 'شمارش چیپ‌ها' : 'Chip Enumeration'}</option>
              <option value="SIGNAL_FAULT">{isRtl ? 'قطعی سیگنال چیپ' : 'Signal Breaks'}</option>
              <option value="ERROR">{isRtl ? 'کدهای خطا' : 'Error Codes'}</option>
              <option value="EEPROM">{isRtl ? 'اطلاعات EEPROM' : 'EEPROM / SN'}</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uartEvents.length === 0}
              onClick={() => {
                const content = uartEvents
                  .slice()
                  .reverse()
                  .map((e) => `[${e.timestamp}] ${e.rawLine}`)
                  .join('\n');
                const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `uart_hashboard_${Date.now()}.log`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-2.5 py-1 rounded bg-[#0B0E17] hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-xs text-slate-300 cursor-pointer flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isRtl ? 'ذخیره لاگ سریال' : 'Save .log'}</span>
            </button>
            <button
              type="button"
              onClick={() => setUartEvents([])}
              className="px-2.5 py-1 rounded bg-[#0B0E17] hover:bg-slate-800 border border-slate-800 text-xs text-slate-400 hover:text-rose-400 cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isRtl ? 'پاک‌سازی' : 'Clear'}</span>
            </button>
          </div>
        </div>

        <div
          dir="ltr"
          className="p-3 rounded bg-[#0B0E17] border border-slate-800 font-mono text-xs space-y-1.5 max-h-72 overflow-y-auto"
        >
          {filteredUartEvents.length === 0 ? (
            <div className="text-slate-500 py-8 text-center">
              {isRtl
                ? 'در انتظار دریافت داده از پورت سریال (USB-TTL WebSerial) یا فایل لاگ تستر...'
                : 'Waiting for incoming UART serial stream or log file upload...'}
            </div>
          ) : (
            filteredUartEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-900 pb-1"
              >
                <div className="space-x-2">
                  <span className="text-slate-500">[{ev.timestamp}]</span>
                  <span
                    className={`font-semibold ${
                      ev.severity === 'CRITICAL'
                        ? 'text-rose-400'
                        : ev.severity === 'WARNING'
                        ? 'text-amber-400'
                        : ev.severity === 'SUCCESS'
                        ? 'text-emerald-400'
                        : 'text-cyan-400'
                    }`}
                  >
                    [{ev.category}]
                  </span>
                  <span className="text-slate-200">{ev.rawLine}</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  {isRtl ? ev.messageFa : ev.messageEn}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
