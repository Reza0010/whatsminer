import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Lightbulb,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import {
  DEFAULT_LOG_CONF,
  DEFAULT_SYSTEM_INI,
  WHATSMINER_ERROR_DATABASE,
} from './repairKnowledgeBase';
import {
  IpRange,
  Language,
  LogConfConfig,
  LogEntry,
  MinerUnit,
  NetworkInterfaceInfo,
  RepairTicket,
  SystemIniConfig,
} from './types';
import { UartHashboardTester } from './UartHashboardTester';
import { PsuRealtimeLogger } from './PsuRealtimeLogger';

type ActiveTab =
  | 'monitor'
  | 'uart_tester'
  | 'psu_logger'
  | 'diagnostics'
  | 'repairs'
  | 'pools_api'
  | 'settings';

export function App() {
  const [lang, setLang] = useState<Language>('fa');
  const isRtl = lang === 'fa';

  const [activeTab, setActiveTab] = useState<ActiveTab>('monitor');
  const [miners, setMiners] = useState<MinerUnit[]>([]);
  const [selectedMinerIds, setSelectedMinerIds] = useState<string[]>([]);
  const [inspectedMinerId, setInspectedMinerId] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<number>(0);

  // Real Host Network Interfaces
  const [hostInterfaces, setHostInterfaces] = useState<NetworkInterfaceInfo[]>([]);

  // Real Disk Config state
  const [systemIni, setSystemIni] = useState<SystemIniConfig>(DEFAULT_SYSTEM_INI);
  const [rawSystemIni, setRawSystemIni] = useState<string>('');
  const [logConf, setLogConf] = useState<LogConfConfig>(DEFAULT_LOG_CONF);
  const [rawLogConf, setRawLogConf] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [repairTickets, setRepairTickets] = useState<RepairTicket[]>([]);

  // Direct TCP 4028 Probe & Subnet Scan state
  const [directIp, setDirectIp] = useState<string>('192.168.1.100');
  const [directPort, setDirectPort] = useState<number>(4028);
  const [adminPassword, setAdminPassword] = useState<string>('admin');
  const [ipRanges, setIpRanges] = useState<IpRange[]>([
    {
      id: 'lan-default',
      name: 'رنج شبکه فارم / کارگاه (192.168.1.x)',
      startIp: '192.168.1.1',
      endIp: '192.168.1.254',
      port: 4028,
      enabled: true,
      foundCount: 0,
    },
  ]);

  const [newRangeName, setNewRangeName] = useState('');
  const [newStartIp, setNewStartIp] = useState('192.168.2.1');
  const [newEndIp, setNewEndIp] = useState('192.168.2.254');
  const [newRangePort, setNewRangePort] = useState(4028);

  const [isScanning, setIsScanning] = useState(false);
  const [autoScanActive, setAutoScanActive] = useState(false);
  const [lastScanStats, setLastScanStats] = useState<{
    probedCount: number;
    onlineCount: number;
    failedSample: { ip: string; port: number; reason: string }[];
  } | null>(null);

  const [statusBanner, setStatusBanner] = useState<{
    type: 'info' | 'success' | 'warning';
    text: string;
  } | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [errorSearchQuery, setErrorSearchQuery] = useState('');
  const [errorCategoryFilter, setErrorCategoryFilter] = useState<string>('ALL');

  // Raw UART / BTMiner Log & JSON Parser state (for offline bench hashboard logs)
  const [rawBenchInput, setRawBenchInput] = useState<string>('');
  const [rawBenchLabel, setRawBenchLabel] = useState<string>('UART-Bench-Test');

  // Engineering Signal Chain & Voltage Domain Calculator state (derived from real measured values)
  const [calcTotalChips, setCalcTotalChips] = useState<number>(114);
  const [calcDetectedChips, setCalcDetectedChips] = useState<number>(0);
  const [calcPsuVoltageV, setCalcPsuVoltageV] = useState<number>(13.65);
  const [calcChipsPerDomain, setCalcChipsPerDomain] = useState<number>(3);

  // Raw TCP 4028 API Console state
  const [apiTargetIp, setApiTargetIp] = useState('192.168.1.100');
  const [apiTargetPort, setApiTargetPort] = useState(4028);
  const [apiJsonInput, setApiJsonInput] = useState('{"cmd":"summary"}');
  const [apiResponseText, setApiResponseText] = useState<string>('');
  const [apiLatencyMs, setApiLatencyMs] = useState<number | null>(null);
  const [apiEncryptedUsed, setApiEncryptedUsed] = useState<boolean>(false);
  const [isSendingApi, setIsSendingApi] = useState(false);

  // New Repair Ticket Form state
  const [ticketForm, setTicketForm] = useState({
    customerName: '',
    minerModel: '',
    boardSn: '',
    slotName: 'SM0',
    chipType: '',
    errorCode: '',
    ldo1v8: '',
    pld0v8: '',
    clk25Mhz: '',
    domainVoltageMv: '',
    faultyChipNo: '',
    actionTaken: '',
    status: 'TESTING' as RepairTicket['status'],
  });

  const notify = (type: 'info' | 'success' | 'warning', text: string) => {
    setStatusBanner({ type, text });
    setTimeout(() => {
      setStatusBanner((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  useEffect(() => {
    async function loadInitialDiskState() {
      try {
        const [cfgRes, logsRes, repRes, netRes] = await Promise.all([
          fetch('/api/config'),
          fetch('/api/logs'),
          fetch('/api/repairs'),
          fetch('/api/network/interfaces'),
        ]);
        if (cfgRes.ok) {
          const cfgData = await cfgRes.json();
          if (cfgData.systemIni) setSystemIni(cfgData.systemIni);
          if (cfgData.rawSystemIni) setRawSystemIni(cfgData.rawSystemIni);
          if (cfgData.logConf) setLogConf(cfgData.logConf);
          if (cfgData.rawLogConf) setRawLogConf(cfgData.rawLogConf);
        }
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setLogs(logsData.logs || []);
        }
        if (repRes.ok) {
          const repData = await repRes.json();
          setRepairTickets(repData.tickets || []);
        }
        if (netRes.ok) {
          const netData = await netRes.json();
          if (Array.isArray(netData.interfaces) && netData.interfaces.length > 0) {
            setHostInterfaces(netData.interfaces);
          }
        }
      } catch {
        // ignore
      }
    }
    loadInitialDiskState();
  }, []);

  useEffect(() => {
    if (!autoScanActive) return;
    const intervalMs = Math.max(5, systemIni.AutoScanInterval || 30) * 1000;
    const timer = setInterval(() => {
      runRealTcpScan(true);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [autoScanActive, systemIni.AutoScanInterval, ipRanges]);

  const refreshLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {
      // ignore
    }
  };

  // Real TCP Socket Scan via /api/miner/scan
  const runRealTcpScan = async (silent = false) => {
    if (isScanning) return;
    const enabledRanges = ipRanges.filter((r) => r.enabled);
    if (enabledRanges.length === 0) {
      if (!silent) {
        notify(
          'warning',
          isRtl
            ? 'لطفاً حداقل یک بازه IP را برای اسکن پورت 4028 فعال کنید.'
            : 'Please enable at least one IP range to scan.'
        );
      }
      return;
    }

    setIsScanning(true);
    try {
      const targets: { ip: string; port: number }[] = [];
      for (const r of enabledRanges) {
        const sParts = r.startIp.split('.').map(Number);
        const eParts = r.endIp.split('.').map(Number);
        if (
          sParts.length === 4 &&
          eParts.length === 4 &&
          sParts[0] === eParts[0] &&
          sParts[1] === eParts[1] &&
          sParts[2] === eParts[2]
        ) {
          const startH = Math.max(1, Math.min(sParts[3], eParts[3]));
          const endH = Math.min(254, Math.max(sParts[3], eParts[3]));
          for (let h = startH; h <= endH && targets.length < 254; h++) {
            targets.push({
              ip: `${sParts[0]}.${sParts[1]}.${sParts[2]}.${h}`,
              port: r.port || 4028,
            });
          }
        } else {
          targets.push({ ip: r.startIp, port: r.port || 4028 });
        }
      }

      const res = await fetch('/api/miner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });

      const data = await res.json();
      if (res.ok && Array.isArray(data.miners)) {
        setMiners(data.miners);
        setLastScanStats({
          probedCount: data.probedCount || targets.length,
          onlineCount: data.onlineCount || data.miners.length,
          failedSample: data.failed || [],
        });

        if (data.miners.length > 0 && !inspectedMinerId) {
          setInspectedMinerId(data.miners[0].id);
          setSelectedMinerIds(data.miners.map((m: MinerUnit) => m.id));
        }

        const nowStr = new Date().toTimeString().slice(0, 8);
        setIpRanges((prev) =>
          prev.map((r) =>
            r.enabled
              ? {
                  ...r,
                  lastScanned: nowStr,
                  foundCount: data.miners.filter((m: MinerUnit) =>
                    m.ip.startsWith(r.startIp.split('.').slice(0, 3).join('.'))
                  ).length,
                }
              : r
          )
        );

        if (!silent) {
          notify(
            data.onlineCount > 0 ? 'success' : 'info',
            isRtl
              ? `اسکن واقعی پورت 4028 کامل شد: ${data.onlineCount} ماینر آنلاین از مجموع ${data.probedCount} آدرس پاسخ دادند.`
              : `Real TCP 4028 scan completed: ${data.onlineCount} online miner(s) responded out of ${data.probedCount} probed.`
          );
        }
      }
      await refreshLogs();
    } catch (err: any) {
      if (!silent) notify('warning', err.message || 'TCP Scan error');
    } finally {
      setIsScanning(false);
    }
  };

  // Probe a single IP:Port directly over real TCP socket
  const handleProbeSingleIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directIp.trim()) return;
    setIsScanning(true);
    try {
      const res = await fetch('/api/miner/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: directIp.trim(), port: Number(directPort) || 4028 }),
      });
      const data = await res.json();
      if (res.ok && data.miner) {
        setMiners((prev) => {
          const exists = prev.some((m) => m.id === data.miner.id);
          return exists
            ? prev.map((m) => (m.id === data.miner.id ? data.miner : m))
            : [data.miner, ...prev];
        });
        setInspectedMinerId(data.miner.id);
        setApiTargetIp(data.miner.ip);
        setApiTargetPort(data.miner.port);
        if (!selectedMinerIds.includes(data.miner.id)) {
          setSelectedMinerIds((prev) => [...prev, data.miner.id]);
        }
        notify(
          'success',
          isRtl
            ? `پاسخ واقعی از ${data.miner.ip}:${data.miner.port} در ${data.miner.latencyMs}ms دریافت شد.`
            : `Received live telemetry from ${data.miner.ip}:${data.miner.port} in ${data.miner.latencyMs}ms.`
        );
      } else {
        notify(
          'warning',
          isRtl
            ? `عدم پاسخ از سوکت TCP ${directIp}:${directPort} — علت: ${data.error || 'Timeout'}`
            : `No TCP response from ${directIp}:${directPort} — ${data.error || 'Timeout'}`
        );
      }
      await refreshLogs();
    } catch (err: any) {
      notify('warning', err.message);
    } finally {
      setIsScanning(false);
    }
  };

  // Parse real UART / SSH / JSON telemetry pasted from a physical test bench
  const handleParseRawBenchLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawBenchInput.trim()) return;
    try {
      const res = await fetch('/api/miner/parse-raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: rawBenchInput,
          label: rawBenchLabel.trim() || 'UART-Bench',
        }),
      });
      const data = await res.json();
      if (res.ok && data.miner) {
        setMiners((prev) => {
          const exists = prev.some((m) => m.id === data.miner.id);
          return exists
            ? prev.map((m) => (m.id === data.miner.id ? data.miner : m))
            : [data.miner, ...prev];
        });
        setInspectedMinerId(data.miner.id);
        setActiveTab('diagnostics');
        notify(
          'success',
          isRtl
            ? 'اطلاعات واقعی لاگ/JSON هش‌برد استخراج و در بخش کالبدشکافی بارگذاری شد.'
            : 'Parsed real hardware telemetry from pasted JSON/UART log.'
        );
        await refreshLogs();
      } else {
        notify('warning', data.error || 'Failed to parse input');
      }
    } catch (err: any) {
      notify('warning', err.message);
    }
  };

  // Send authenticated write command over TCP 4028 (using real get_token + MD5 + AES-256-ECB)
  const executeBatchCommand = async (
    payloadBuilder: (miner: MinerUnit) => Record<string, unknown>,
    descFa: string,
    descEn: string
  ) => {
    const targets = miners.filter((m) => selectedMinerIds.includes(m.id));
    if (targets.length === 0) {
      notify(
        'warning',
        isRtl
          ? 'ابتدا حداقل یک ماینر متصل را از جدول انتخاب کنید.'
          : 'Select at least one connected miner from the table.'
      );
      return;
    }

    try {
      const results = await Promise.allSettled(
        targets.map((m) =>
          fetch('/api/miner/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ip: m.ip,
              port: m.port,
              adminPassword,
              payload: payloadBuilder(m),
            }),
          })
        )
      );
      const okCount = results.filter(
        (r) => r.status === 'fulfilled' && r.value.ok
      ).length;
      await refreshLogs();
      notify(
        okCount > 0 ? 'success' : 'warning',
        `${isRtl ? descFa : descEn} (${okCount}/${targets.length})`
      );
    } catch (err: any) {
      notify('warning', err.message);
    }
  };

  const computeWorkerName = (baseWorker: string, ip: string, ipCheck: number) => {
    if (!baseWorker) return '';
    if (!ipCheck || systemIni.IPSuffixSel === 0) return baseWorker;
    const parts = ip.split('.');
    if (parts.length !== 4) return baseWorker;
    if (systemIni.IPSuffixSel === 1) return `${baseWorker}.${parts[3]}`;
    return `${baseWorker}.${parts[2]}x${parts[3]}`;
  };

  const handleSaveConfigToDisk = async () => {
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemIni, logConf }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRawSystemIni(updated.rawSystemIni);
        setRawLogConf(updated.rawLogConf);
        await refreshLogs();
        notify(
          'success',
          isRtl
            ? 'فایل‌های setting/system.ini و setting/log.conf روی دیسک ذخیره شدند.'
            : 'Saved setting/system.ini and setting/log.conf to disk.'
        );
      }
    } catch (err: any) {
      notify('warning', err.message);
    }
  };

  const handleSendRawApi = async (customCmd?: string) => {
    const payloadText = customCmd || apiJsonInput;
    if (customCmd) setApiJsonInput(customCmd);
    setIsSendingApi(true);
    try {
      const parsedPayload = JSON.parse(payloadText);
      const res = await fetch('/api/miner/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: apiTargetIp.trim(),
          port: Number(apiTargetPort),
          adminPassword,
          payload: parsedPayload,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setApiLatencyMs(data.latencyMs);
        setApiEncryptedUsed(Boolean(data.usedEncryption));
        setApiResponseText(JSON.stringify(data.parsed, null, 2));
      } else {
        setApiLatencyMs(null);
        setApiResponseText(JSON.stringify({ error: data.error }, null, 2));
      }
      await refreshLogs();
    } catch (err: any) {
      setApiResponseText(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setIsSendingApi(false);
    }
  };

  const handleCreateRepairTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/repairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticketForm),
      });
      if (res.ok) {
        const data = await res.json();
        setRepairTickets(data.tickets || []);
        notify(
          'success',
          isRtl
            ? 'کارت تعمیر در فایل setting/repair_tickets.json ذخیره شد.'
            : 'Saved repair ticket to setting/repair_tickets.json.'
        );
      }
    } catch (err: any) {
      notify('warning', err.message);
    }
  };

  const handleDeleteRepairTicket = async (id: string) => {
    try {
      const res = await fetch(`/api/repairs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setRepairTickets(data.tickets || []);
      }
    } catch {
      // ignore
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'IP',
      'Port',
      'Latency(ms)',
      'MAC',
      'Model',
      'ControlBoard',
      'Firmware',
      'Status',
      'RT_Hashrate(TH/s)',
      'Avg_Hashrate(TH/s)',
      'Power(W)',
      'PowerRate(J/TH)',
      'ChipTempMax(C)',
      'FanIn(RPM)',
      'FanOut(RPM)',
      'PSU_Model',
      'PSU_Vin(V)',
      'PSU_Vout(mV)',
      'Pool1',
      'Worker1',
      'ErrorCodes',
    ];
    const rows = miners.map((m) =>
      [
        m.ip,
        m.port,
        m.latencyMs,
        m.mac || '',
        `"${m.model || ''}"`,
        `"${m.controlBoard || ''}"`,
        m.firmware || '',
        m.status,
        m.hashrateRtTh ?? '',
        m.hashrateAvgTh ?? '',
        m.powerW ?? '',
        m.powerRateJTh ?? '',
        m.chipTempMax ?? '',
        m.fanIn ?? '',
        m.fanOut ?? '',
        m.psu?.model || '',
        m.psu?.vin ?? '',
        m.psu?.voutMv ?? '',
        m.pools?.[0]?.url || '',
        m.pools?.[0]?.user || '',
        `"${m.errorCodes.map((e) => e.code).join(';')}"`,
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'whatsminer_real_telemetry.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredMiners = useMemo(() => {
    return miners.filter((m) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        m.ip.toLowerCase().includes(q) ||
        m.mac.toLowerCase().includes(q) ||
        m.model.toLowerCase().includes(q) ||
        m.serialNo.toLowerCase().includes(q) ||
        m.errorCodes.some((e) => e.code.includes(q));
      const matchStatus = statusFilter === 'ALL' || m.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [miners, searchQuery, statusFilter]);

  const inspectedMiner = useMemo(() => {
    return miners.find((m) => m.id === inspectedMinerId) || miners[0] || null;
  }, [miners, inspectedMinerId]);

  const inspectedBoard = useMemo(() => {
    if (!inspectedMiner) return null;
    return (
      inspectedMiner.hashboards.find((b) => b.slot === selectedSlot) ||
      inspectedMiner.hashboards[0] ||
      null
    );
  }, [inspectedMiner, selectedSlot]);

  // Sync engineering domain calculator when a real board is selected
  useEffect(() => {
    if (inspectedBoard) {
      if (inspectedBoard.totalChips) setCalcTotalChips(inspectedBoard.totalChips);
      if (inspectedBoard.effectiveChips !== null) {
        setCalcDetectedChips(inspectedBoard.effectiveChips);
      }
    }
    if (inspectedMiner?.psu?.voutMv) {
      setCalcPsuVoltageV(Number((inspectedMiner.psu.voutMv / 1000).toFixed(2)));
    }
  }, [inspectedBoard, inspectedMiner]);

  const filteredErrors = useMemo(() => {
    return WHATSMINER_ERROR_DATABASE.filter((item) => {
      const q = errorSearchQuery.toLowerCase().trim();
      const matchQ =
        !q ||
        item.code.toLowerCase().includes(q) ||
        item.titleFa.toLowerCase().includes(q) ||
        item.titleEn.toLowerCase().includes(q) ||
        item.causeFa.toLowerCase().includes(q) ||
        item.testPoints.toLowerCase().includes(q);
      const matchCat = errorCategoryFilter === 'ALL' || item.category === errorCategoryFilter;
      return matchQ && matchCat;
    });
  }, [errorSearchQuery, errorCategoryFilter]);

  const fleetSummary = useMemo(() => {
    const totalTh = miners.reduce((a, m) => a + (m.hashrateRtTh ?? 0), 0);
    const totalW = miners.reduce((a, m) => a + (m.powerW ?? 0), 0);
    const temps = miners
      .map((m) => m.chipTempMax)
      .filter((t): t is number => t !== null);
    const maxTemp = temps.length > 0 ? Math.max(...temps) : null;
    const activeErrorCount = miners.reduce((a, m) => a + m.errorCodes.length, 0);
    return {
      totalTh: totalTh.toFixed(2),
      totalKw: (totalW / 1000).toFixed(2),
      maxTemp: maxTemp !== null ? maxTemp.toFixed(1) : '—',
      activeErrorCount,
    };
  }, [miners]);

  // Engineering calculation for signal break location & voltage domain
  const domainMath = useMemo(() => {
    const totalDomains = Math.max(1, Math.ceil(calcTotalChips / Math.max(1, calcChipsPerDomain)));
    const expectedDomainMv = Math.round((calcPsuVoltageV * 1000) / totalDomains);
    const isComplete = calcDetectedChips >= calcTotalChips;
    const suspectChipA = calcDetectedChips;
    const suspectChipB = Math.min(calcTotalChips, calcDetectedChips + 1);
    const suspectDomain = Math.ceil(suspectChipB / Math.max(1, calcChipsPerDomain));
    return {
      totalDomains,
      expectedDomainMv,
      isComplete,
      suspectChipA,
      suspectChipB,
      suspectDomain,
    };
  }, [calcTotalChips, calcDetectedChips, calcPsuVoltageV, calcChipsPerDomain]);

  const formatVal = (v: number | string | null | undefined, suffix = '') => {
    if (v === null || v === undefined || v === '') return '—';
    return `${v}${suffix}`;
  };

  const formatUptime = (sec: number | null) => {
    if (sec === null || sec === undefined) return '—';
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
  };

  const navItems: { id: ActiveTab; labelFa: string; labelEn: string }[] = [
    { id: 'monitor', labelFa: 'اسکنر شبکه (TCP 4028)', labelEn: 'Live TCP Monitor' },
    { id: 'uart_tester', labelFa: 'تستر سریال هش‌برد (UART)', labelEn: 'WebSerial UART Tester' },
    { id: 'psu_logger', labelFa: 'پایش نوسان پاور (P21/P221B)', labelEn: 'PSU Real-Time Logger' },
    { id: 'diagnostics', labelFa: 'کالبدشکافی و میز تعمیر', labelEn: 'Diagnostics & Bench' },
    { id: 'settings', labelFa: 'استخر، API و تنظیمات', labelEn: 'Pools, API & Config' },
  ];

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#0B0E17] text-slate-100 flex flex-col selection:bg-cyan-500/30"
    >
      {/* Top Bar Contract: Strictly 3 zones (Brand wordmark | 5 nav links | 2 primary actions) */}
      <header className="border-b border-slate-800 bg-[#0F172A] sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('monitor');
            }}
            className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            {isRtl ? 'واتس‌ماینر تولز' : 'WhatsMinerTool'}
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const isActive =
                activeTab === item.id ||
                (item.id === 'diagnostics' && activeTab === 'repairs') ||
                (item.id === 'settings' && activeTab === 'pools_api');
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'border-cyan-400 text-white font-semibold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isRtl ? item.labelFa : item.labelEn}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setLang((prev) => (prev === 'fa' ? 'en' : 'fa'))}
              className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isRtl ? 'English (LTR)' : 'فارسی (RTL)'}
            </button>

            <button
              onClick={() => runRealTcpScan(false)}
              disabled={isScanning}
              className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>
                {isScanning
                  ? isRtl
                    ? 'در حال اسکن پورت ۴۰۲۸...'
                    : 'Scanning TCP 4028...'
                  : isRtl
                  ? 'اسکن واقعی شبکه'
                  : 'Scan TCP 4028'}
              </span>
            </button>
          </div>
        </div>

        <div className="flex md:hidden overflow-x-auto border-t border-slate-800 px-4 py-2 gap-2 bg-[#0B0E17]">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`px-3 py-1 text-xs rounded whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                  : 'text-slate-400'
              }`}
            >
              {isRtl ? item.labelFa : item.labelEn}
            </button>
          ))}
        </div>
      </header>

      {statusBanner && (
        <div
          className={`border-b px-6 py-2 text-xs font-medium ${
            statusBanner.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
              : statusBanner.type === 'warning'
              ? 'bg-amber-950/90 border-amber-800 text-amber-200'
              : 'bg-slate-900 border-slate-700 text-cyan-200'
          }`}
        >
          <div className="max-w-[1440px] mx-auto flex items-center justify-between">
            <span>{statusBanner.text}</span>
            <button
              onClick={() => setStatusBanner(null)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              {isRtl ? 'بستن' : 'Dismiss'}
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6 space-y-6">
        {/* Strict Real Telemetry Summary Bar */}
        <section className="grid grid-cols-2 md:grid-cols-4 border border-slate-800 bg-[#111827] rounded-lg divide-y md:divide-y-0 md:divide-x md:divide-slate-800 rtl:md:divide-x-reverse">
          <div className="p-4">
            <div className="text-xs text-slate-400">
              {isRtl ? 'ماینرهای پاسخ‌دهنده (TCP 4028)' : 'Responding Miners (TCP 4028)'}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold font-mono tabular-nums text-white">
                {miners.length}
              </span>
              <span className="text-xs font-mono text-slate-400">
                {isRtl ? 'دستگاه واقعی' : 'LIVE UNITS'}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {isRtl
                ? `حساب API: ${systemIni.AccountName} · تایم‌اوت: ${systemIni.MinerTimeout}ms`
                : `API Account: ${systemIni.AccountName} · Timeout: ${systemIni.MinerTimeout}ms`}
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-400">
              {isRtl ? 'مجموع تراهش واقعی (HS RT)' : 'Total Real-Time Hashrate'}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold font-mono tabular-nums text-cyan-400">
                {fleetSummary.totalTh}
              </span>
              <span className="text-xs font-mono text-slate-400">TH/s</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {isRtl ? 'بدون مقدار پیش‌فرض یا شبیه‌سازی' : 'Zero synthetic fallback values'}
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-400">
              {isRtl ? 'توان مصرفی گزارش‌شده (Power)' : 'Reported Power Draw'}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold font-mono tabular-nums text-white">
                {fleetSummary.totalKw}
              </span>
              <span className="text-xs font-mono text-slate-400">kW</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {isRtl ? 'مستقیم از پاور ماینر (get_psu)' : 'Direct from PSU I2C telemetry'}
            </div>
          </div>

          <div className="p-4">
            <div className="text-xs text-slate-400">
              {isRtl ? 'حداکثر دمای چیپ / کدهای خطا' : 'Max Chip Temp / Error Codes'}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold font-mono tabular-nums text-white">
                {fleetSummary.maxTemp}
              </span>
              <span className="text-xs font-mono text-slate-400">
                °C · {fleetSummary.activeErrorCount} {isRtl ? 'خطا' : 'ERR'}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {isRtl ? 'گزارش مستقیم get_error_code' : 'Direct from get_error_code'}
            </div>
          </div>
        </section>

        {/* =====================================================================
            TAB 1: REAL TCP 4028 SCANNER & LIVE TELEMETRY TABLE
        ===================================================================== */}
        {activeTab === 'monitor' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <aside className="lg:col-span-4 space-y-6">
              {/* Direct Single Miner TCP Probe */}
              <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    {isRtl
                      ? 'اتصال مستقیم TCP به ماینر واقعی (پورت 4028)'
                      : 'Direct TCP Connection to Physical Miner'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {isRtl
                      ? 'ارسال دستورات واقعی summary، edevs، get_psu، get_error_code و get_miner_info به آدرس IP ماینر.'
                      : 'Queries summary, edevs, get_psu, get_error_code, and get_miner_info over TCP port 4028.'}
                  </p>
                </div>

                <form onSubmit={handleProbeSingleIp} className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-400 mb-1">
                        {isRtl ? 'آدرس IP ماینر' : 'Miner IP Address'}
                      </label>
                      <input
                        type="text"
                        value={directIp}
                        onChange={(e) => setDirectIp(e.target.value)}
                        placeholder="192.168.1.100"
                        className="w-full px-3 py-2 rounded-md bg-[#0B0E17] border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        {isRtl ? 'پورت API' : 'API Port'}
                      </label>
                      <input
                        type="number"
                        value={directPort}
                        onChange={(e) => setDirectPort(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-md bg-[#0B0E17] border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      {isRtl
                        ? 'رمز عبور API جهت دستورات کنترلی (get_token AES-256)'
                        : 'Admin Password for Encrypted Write API (get_token)'}
                    </label>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="admin / super"
                      className="w-full px-3 py-1.5 rounded-md bg-[#0B0E17] border border-slate-800 text-xs font-mono text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isScanning}
                    className="w-full py-2 px-4 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
                  >
                    {isRtl
                      ? 'اتصال و خواندن اطلاعات واقعی ماینر'
                      : 'Connect & Read Real Miner Data'}
                  </button>
                </form>

                {/* Detected Host Network Interfaces */}
                {hostInterfaces.length > 0 && (
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    <div className="text-xs font-medium text-slate-300">
                      {isRtl
                        ? 'کارت‌های شبکه شناسایی‌شده روی سرور:'
                        : 'Detected Host Network Interfaces:'}
                    </div>
                    {hostInterfaces.map((iface) => (
                      <div
                        key={iface.address}
                        className="flex items-center justify-between text-xs font-mono bg-[#0B0E17] px-3 py-2 rounded border border-slate-800"
                      >
                        <span className="text-slate-300">
                          {iface.name}: {iface.address}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setIpRanges((prev) => [
                              ...prev,
                              {
                                id: `iface-${Date.now()}`,
                                name: `${iface.name} (${iface.cidr})`,
                                startIp: iface.suggestedStart,
                                endIp: iface.suggestedEnd,
                                port: 4028,
                                enabled: true,
                                foundCount: 0,
                              },
                            ]);
                          }}
                          className="text-cyan-400 hover:underline cursor-pointer"
                        >
                          {isRtl ? '+ افزودن رنج' : '+ Add Subnet'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Subnet Range Configuration */}
              <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">
                    {isRtl ? 'بازه آی‌پی‌های اسکن شبکه' : 'Subnet Scan Ranges'}
                  </h2>
                  <button
                    onClick={() => setAutoScanActive((v) => !v)}
                    className={`px-2.5 py-1 rounded text-xs font-medium border cursor-pointer ${
                      autoScanActive
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                        : 'bg-[#0B0E17] border-slate-800 text-slate-400'
                    }`}
                  >
                    {isRtl
                      ? `اسکن خودکار (${systemIni.AutoScanInterval}s): ${
                          autoScanActive ? 'فعال' : 'غیرفعال'
                        }`
                      : `Auto Scan (${systemIni.AutoScanInterval}s): ${
                          autoScanActive ? 'ON' : 'OFF'
                        }`}
                  </button>
                </div>

                <div className="divide-y divide-slate-800 border-t border-b border-slate-800">
                  {ipRanges.map((range) => (
                    <div key={range.id} className="py-3 flex items-start justify-between gap-2">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={range.enabled}
                          onChange={() =>
                            setIpRanges((prev) =>
                              prev.map((r) =>
                                r.id === range.id ? { ...r, enabled: !r.enabled } : r
                              )
                            )
                          }
                          className="mt-1 rounded border-slate-700 text-cyan-500"
                        />
                        <div>
                          <div className="text-xs font-medium text-slate-200">{range.name}</div>
                          <div className="text-xs font-mono text-cyan-400 mt-0.5">
                            {range.startIp} – {range.endIp} :{range.port}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {isRtl
                              ? `پاسخ‌دهنده: ${range.foundCount} دستگاه`
                              : `Responded: ${range.foundCount} units`}
                            {range.lastScanned ? ` · ${range.lastScanned}` : ''}
                          </div>
                        </div>
                      </label>
                      <button
                        onClick={() =>
                          setIpRanges((prev) => prev.filter((r) => r.id !== range.id))
                        }
                        className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newStartIp.trim() || !newEndIp.trim()) return;
                    setIpRanges((prev) => [
                      ...prev,
                      {
                        id: `range-${Date.now()}`,
                        name:
                          newRangeName.trim() ||
                          (isRtl ? `ردیف شبکه ${prev.length + 1}` : `Subnet ${prev.length + 1}`),
                        startIp: newStartIp.trim(),
                        endIp: newEndIp.trim(),
                        port: Number(newRangePort) || 4028,
                        enabled: true,
                        foundCount: 0,
                      },
                    ]);
                    setNewRangeName('');
                  }}
                  className="space-y-2.5"
                >
                  <input
                    type="text"
                    placeholder={isRtl ? 'نام بازه (مثلاً ردیف اول کارگاه)' : 'Range label'}
                    value={newRangeName}
                    onChange={(e) => setNewRangeName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-md bg-[#0B0E17] border border-slate-800 text-xs text-white"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="192.168.1.1"
                      value={newStartIp}
                      onChange={(e) => setNewStartIp(e.target.value)}
                      className="px-2.5 py-1.5 rounded-md bg-[#0B0E17] border border-slate-800 text-xs font-mono text-white"
                    />
                    <input
                      type="text"
                      placeholder="192.168.1.254"
                      value={newEndIp}
                      onChange={(e) => setNewEndIp(e.target.value)}
                      className="px-2.5 py-1.5 rounded-md bg-[#0B0E17] border border-slate-800 text-xs font-mono text-white"
                    />
                    <input
                      type="number"
                      placeholder="4028"
                      value={newRangePort}
                      onChange={(e) => setNewRangePort(Number(e.target.value))}
                      className="px-2.5 py-1.5 rounded-md bg-[#0B0E17] border border-slate-800 text-xs font-mono text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 px-4 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'افزودن بازه IP' : 'Add Subnet Range'}</span>
                  </button>
                </form>
              </div>
            </aside>

            {/* Right Column: Live Discovered Miners & UART/JSON Importer */}
            <section className="lg:col-span-8 space-y-6">
              <div className="bg-[#111827] border border-slate-800 rounded-lg flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 left-3 rtl:left-auto rtl:right-3" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={
                          isRtl
                            ? 'جستجوی IP، مک‌آدرس، مدل یا کد خطا...'
                            : 'Search IP, MAC, model, or error code...'
                        }
                        className="w-full pl-8 pr-3 rtl:pl-3 rtl:pr-8 py-1.5 rounded-md bg-[#0B0E17] border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-3 py-1.5 rounded-md bg-[#0B0E17] border border-slate-800 text-xs text-slate-200"
                    >
                      <option value="ALL">{isRtl ? 'همه وضعیت‌ها' : 'All Statuses'}</option>
                      <option value="Mining">{isRtl ? 'در حال ماین (Mining)' : 'Mining'}</option>
                      <option value="Warning">{isRtl ? 'دارای خطا (Warning)' : 'Warning'}</option>
                      <option value="Offline">{isRtl ? 'آفلاین (Offline)' : 'Offline'}</option>
                    </select>
                  </div>

                  {/* Authenticated Batch Controls */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() =>
                        executeBatchCommand(
                          () => ({ cmd: 'set_low_power' }),
                          'فرمان set_low_power ارسال شد',
                          'Sent set_low_power'
                        )
                      }
                      className="px-2.5 py-1.5 rounded bg-[#0B0E17] hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 cursor-pointer whitespace-nowrap"
                    >
                      {isRtl ? 'مد کم‌مصرف (Low)' : 'Low Power'}
                    </button>
                    <button
                      onClick={() =>
                        executeBatchCommand(
                          () => ({ cmd: 'set_normal_power' }),
                          'فرمان set_normal_power ارسال شد',
                          'Sent set_normal_power'
                        )
                      }
                      className="px-2.5 py-1.5 rounded bg-[#0B0E17] hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 cursor-pointer whitespace-nowrap"
                    >
                      {isRtl ? 'مد نرمال (Normal)' : 'Normal'}
                    </button>
                    <button
                      onClick={() =>
                        executeBatchCommand(
                          () => ({ cmd: 'set_high_power' }),
                          'فرمان set_high_power ارسال شد',
                          'Sent set_high_power'
                        )
                      }
                      className="px-2.5 py-1.5 rounded bg-[#0B0E17] hover:bg-slate-800 border border-slate-800 text-xs text-cyan-300 cursor-pointer whitespace-nowrap"
                    >
                      {isRtl ? 'مد پرقدرت (High)' : 'High Power'}
                    </button>
                    <button
                      onClick={() =>
                        executeBatchCommand(
                          () => ({ cmd: 'reboot' }),
                          'فرمان ریبوت ارسال شد',
                          'Sent reboot command'
                        )
                      }
                      className="px-2.5 py-1.5 rounded bg-[#0B0E17] hover:bg-slate-800 border border-slate-800 text-xs text-amber-300 cursor-pointer flex items-center gap-1 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isRtl ? 'ریبوت' : 'Reboot'}</span>
                    </button>
                    <button
                      onClick={handleExportCsv}
                      disabled={miners.length === 0}
                      className="px-2.5 py-1.5 rounded bg-[#0B0E17] hover:bg-slate-800 disabled:opacity-40 border border-slate-800 text-xs text-slate-300 cursor-pointer flex items-center gap-1 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </button>
                  </div>
                </div>

                {/* Live Miners Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-[#0B0E17] text-slate-400">
                        <th className="py-3 px-3 text-start">
                          <input
                            type="checkbox"
                            checked={
                              filteredMiners.length > 0 &&
                              filteredMiners.every((m) => selectedMinerIds.includes(m.id))
                            }
                            onChange={() => {
                              const allIds = filteredMiners.map((m) => m.id);
                              const allSelected = allIds.every((id) =>
                                selectedMinerIds.includes(id)
                              );
                              if (allSelected) {
                                setSelectedMinerIds((prev) =>
                                  prev.filter((id) => !allIds.includes(id))
                                );
                              } else {
                                setSelectedMinerIds((prev) =>
                                  Array.from(new Set([...prev, ...allIds]))
                                );
                              }
                            }}
                            className="rounded border-slate-700 text-cyan-500"
                          />
                        </th>
                        <th className="py-3 px-3 text-start">
                          {isRtl ? 'IP:Port / پینگ' : 'IP:Port / RTT'}
                        </th>
                        <th className="py-3 px-3 text-start">
                          {isRtl ? 'مدل / کنترل‌برد / فریمور' : 'Model / CB / FW'}
                        </th>
                        <th className="py-3 px-3 text-end">
                          {isRtl ? 'تراهش (TH/s)' : 'Hashrate (TH/s)'}
                        </th>
                        <th className="py-3 px-3 text-end">
                          {isRtl ? 'چیپ‌های فعال (هر برد)' : 'Effective Chips'}
                        </th>
                        <th className="py-3 px-3 text-end">
                          {isRtl ? 'دمای چیپ / فن‌ها' : 'Chip Temp / Fans'}
                        </th>
                        <th className="py-3 px-3 text-end">
                          {isRtl ? 'توان / ولتاژ پاور' : 'Power / PSU Vout'}
                        </th>
                        <th className="py-3 px-3 text-start">
                          {isRtl ? 'کد خطا / آپتایم' : 'Error Codes / Uptime'}
                        </th>
                        <th className="py-3 px-3 text-end">
                          {isRtl ? 'کالبدشکافی' : 'Diagnostics'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {filteredMiners.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 px-4 text-center text-slate-400">
                            <div className="max-w-lg mx-auto space-y-2">
                              <p className="text-sm font-semibold text-slate-200">
                                {isRtl
                                  ? 'هنوز هیچ ماینر فیزیکی در این شبکه به پورت 4028 پاسخ نداده است'
                                  : 'No physical WhatsMiner has responded on TCP port 4028 yet'}
                              </p>
                              <p className="text-xs text-slate-400 leading-relaxed">
                                {isRtl
                                  ? 'تمام داده‌های ساختگی و پیش‌فرض حذف شده‌اند. برای دریافت اطلاعات واقعی، آدرس IP ماینر خود را در ستون کناری وارد کنید یا خروجی واقعی لاگ UART / JSON هش‌برد را در کادر پایین بارگذاری نمایید.'
                                  : 'All synthetic mock data is disabled. Enter a real miner IP:4028 on the left, scan your LAN subnet, or paste real UART/JSON output from your bench below.'}
                              </p>
                              {lastScanStats && lastScanStats.failedSample.length > 0 && (
                                <div className="mt-3 p-2.5 rounded bg-[#0B0E17] border border-slate-800 text-[11px] font-mono text-slate-400 text-start">
                                  <div>
                                    {isRtl
                                      ? `نتیجه آخرین اسکن شبکه: ${lastScanStats.probedCount} آدرس بررسی شد، ${lastScanStats.onlineCount} پاسخ دریافت شد.`
                                      : `Last TCP Scan: Probed ${lastScanStats.probedCount} hosts, ${lastScanStats.onlineCount} responded.`}
                                  </div>
                                  <div className="text-slate-500 mt-1">
                                    {lastScanStats.failedSample
                                      .slice(0, 3)
                                      .map((f) => `${f.ip}:${f.port} (${f.reason})`)
                                      .join(' · ')}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredMiners.map((miner) => {
                          const isSelected = selectedMinerIds.includes(miner.id);
                          return (
                            <tr
                              key={miner.id}
                              className={`hover:bg-slate-800/40 transition-colors ${
                                isSelected ? 'bg-cyan-950/15' : ''
                              }`}
                            >
                              <td className="py-3 px-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() =>
                                    setSelectedMinerIds((prev) =>
                                      prev.includes(miner.id)
                                        ? prev.filter((id) => id !== miner.id)
                                        : [...prev, miner.id]
                                    )
                                  }
                                  className="rounded border-slate-700 text-cyan-500"
                                />
                              </td>
                              <td className="py-3 px-3 font-mono tabular-nums">
                                <div className="font-semibold text-white">
                                  {miner.ip}:{miner.port}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {formatVal(miner.mac)} · {miner.latencyMs}ms
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-medium text-slate-200">
                                  {formatVal(miner.model)}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">
                                  {formatVal(miner.controlBoard)} · {formatVal(miner.firmware)}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-end font-mono tabular-nums">
                                <div className="font-semibold text-cyan-400">
                                  {formatVal(miner.hashrateRtTh)}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Avg {formatVal(miner.hashrateAvgTh)} · {formatVal(miner.freqAvg, 'MHz')}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-end font-mono tabular-nums">
                                <div className="font-semibold text-slate-200">
                                  {miner.hashboards.length > 0
                                    ? miner.hashboards
                                        .map((b) => formatVal(b.effectiveChips))
                                        .join(' / ')
                                    : '—'}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {miner.hashboards.length} {isRtl ? 'اسلات' : 'slot(s)'}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-end font-mono tabular-nums">
                                <div className="font-semibold text-slate-200">
                                  {formatVal(miner.chipTempMax, '°C')}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {formatVal(miner.fanIn)} / {formatVal(miner.fanOut)} RPM
                                </div>
                              </td>
                              <td className="py-3 px-3 text-end font-mono tabular-nums">
                                <div className="text-slate-200">
                                  {formatVal(miner.powerW, 'W')}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {miner.psu?.voutMv
                                    ? `${(miner.psu.voutMv / 1000).toFixed(2)}V`
                                    : '—'}{' '}
                                  · {formatVal(miner.psu?.model)}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                {miner.errorCodes.length > 0 ? (
                                  <div className="font-mono font-semibold text-rose-400">
                                    {miner.errorCodes.map((e) => e.code).join(', ')}
                                  </div>
                                ) : (
                                  <div className="text-emerald-400 font-medium">0 Errors</div>
                                )}
                                <div className="text-[11px] font-mono text-slate-500">
                                  {formatUptime(miner.elapsedSec)}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-end">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={async () => {
                                      await fetch('/api/miner/command', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          ip: miner.ip,
                                          port: miner.port,
                                          adminPassword,
                                          payload: {
                                            cmd: 'set_led',
                                            param: miner.ledFlashing ? 'auto' : 'flash',
                                          },
                                        }),
                                      });
                                    }}
                                    title={isRtl ? 'چشمک‌زن چراغ LED' : 'LED Locate'}
                                    className="p-1.5 rounded border bg-[#0B0E17] border-slate-800 text-slate-400 hover:text-white cursor-pointer"
                                  >
                                    <Lightbulb className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setInspectedMinerId(miner.id);
                                      setSelectedSlot(miner.hashboards[0]?.slot ?? 0);
                                      setActiveTab('diagnostics');
                                    }}
                                    className="px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 font-medium cursor-pointer whitespace-nowrap"
                                  >
                                    {isRtl ? 'کالبدشکافی برد' : 'Inspect'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setInspectedMinerId(miner.id);
                                      setDirectIp(miner.ip);
                                      setDirectPort(miner.port);
                                      setActiveTab('psu_logger');
                                    }}
                                    className="px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-medium cursor-pointer whitespace-nowrap"
                                  >
                                    {isRtl ? 'لاگر پاور' : 'PSU Log'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Real UART / BTMiner Log & JSON Parser for Offline Bench Testing */}
              <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {isRtl
                      ? 'ورود مستقیم لاگ واقعی UART / پورت سریال تستر یا JSON خام ماینر'
                      : 'Import Real UART / Serial Tester Log or Raw BTMiner JSON'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isRtl
                      ? 'اگر هش‌برد را با کابل USB-TTL (پورت سریال UART) یا تستر روی میز کار تست می‌کنید، خروجی واقعی ترمینال (Putty/SecureCRT) یا پاسخ JSON دستگاه را اینجا قرار دهید تا دقیقاً همان مقادیر واقعی تجزیه و تحلیل شود.'
                      : 'Paste real output from your UART serial terminal (PuTTY/SecureCRT) or raw JSON from edevs/summary to parse exact hardware values.'}
                  </p>
                </div>

                <form onSubmit={handleParseRawBenchLog} className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={rawBenchLabel}
                      onChange={(e) => setRawBenchLabel(e.target.value)}
                      placeholder={isRtl ? 'شناسه برد/ماینر (مثلاً Bench-M30S-SM1)' : 'Board/Miner Label'}
                      className="px-3 py-1.5 rounded bg-[#0B0E17] border border-slate-800 text-xs font-mono text-white"
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer"
                    >
                      {isRtl
                        ? 'تجزیه و نمایش مقادیر واقعی در کالبدشکافی'
                        : 'Parse & Load Real Values'}
                    </button>
                  </div>

                  <textarea
                    rows={4}
                    dir="ltr"
                    value={rawBenchInput}
                    onChange={(e) => setRawBenchInput(e.target.value)}
                    placeholder={`Paste real JSON (e.g. {"SUMMARY":[...],"DEVS":[...]}) or real btminer UART lines:\nSM0: effective chips: 114, freq: 648, temp: 62.5, hash: 37.2\nSM1: effective chips: 42, freq: 410, temp: 68.4, hash: 13.4\nerror_code: 541\nvin: 224.5, vout: 13650, power: 3320`}
                    className="w-full p-3 rounded bg-[#0B0E17] border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                  />
                </form>
              </div>
            </section>
          </div>
        )}

        {/* =====================================================================
            NEW TAB: DIRECT WEBSERIAL / UART HASHBOARD TESTER
        ===================================================================== */}
        {activeTab === 'uart_tester' && (
          <UartHashboardTester
            lang={lang}
            notify={notify}
            onImportMinerTelemetry={(miner) => {
              setMiners((prev) => {
                const exists = prev.some((m) => m.id === miner.id);
                return exists
                  ? prev.map((m) => (m.id === miner.id ? miner : m))
                  : [miner, ...prev];
              });
              setInspectedMinerId(miner.id);
              setActiveTab('diagnostics');
              notify(
                'success',
                isRtl
                  ? 'داده‌های واقعی پورت سریال هش‌برد به بخش کالبدشکافی منتقل شد.'
                  : 'Imported UART Hashboard telemetry into Diagnostics.'
              );
            }}
            onCreateRepairDraft={(draft) => {
              setTicketForm((prev) => ({
                ...prev,
                minerModel: draft.minerModel || prev.minerModel,
                boardSn: draft.boardSn || prev.boardSn,
                slotName: draft.slotName || prev.slotName,
                chipType: draft.chipType || prev.chipType,
                errorCode: draft.errorCode || prev.errorCode,
                domainVoltageMv: draft.domainVoltageMv || prev.domainVoltageMv,
                faultyChipNo: draft.faultyChipNo || prev.faultyChipNo,
                actionTaken: draft.actionTaken || prev.actionTaken,
              }));
              setActiveTab('repairs');
              notify(
                'info',
                isRtl
                  ? `مشخصات چیپ معیوب (${draft.faultyChipNo}) در فرم کارت تعمیرات بارگذاری شد.`
                  : `Loaded faulty chip (${draft.faultyChipNo}) into Repair Bench form.`
              );
            }}
          />
        )}

        {/* =====================================================================
            NEW TAB: REAL-TIME PSU P21 / P221B FLUCTUATION LOGGER
        ===================================================================== */}
        {activeTab === 'psu_logger' && (
          <PsuRealtimeLogger
            lang={lang}
            miners={miners}
            defaultIp={inspectedMiner?.ip || directIp}
            defaultPort={inspectedMiner?.port || directPort}
            notify={notify}
          />
        )}

        {/* =====================================================================
            TAB 2: EXACT HASHBOARD & PSU INSPECTOR + DOMAIN CALCULATOR
        ===================================================================== */}
        {(activeTab === 'diagnostics' || activeTab === 'repairs') && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111827] border border-slate-800 rounded-lg p-3">
            <div className="flex items-center gap-1 p-1 bg-[#0B0E17] border border-slate-800 rounded-md text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('diagnostics')}
                className={`px-3 py-1.5 rounded transition-colors cursor-pointer ${
                  activeTab === 'diagnostics'
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isRtl
                  ? 'کالبدشکافی هش‌برد و محاسبه‌گر دامین'
                  : 'Hashboard Inspector & Domain Math'}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('repairs')}
                className={`px-3 py-1.5 rounded transition-colors cursor-pointer ${
                  activeTab === 'repairs'
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isRtl
                  ? 'بانک جامع کدهای خطا و دفتر ثبت تعمیرات'
                  : 'Error Code Database & Repair Logbook'}
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('uart_tester')}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-medium cursor-pointer"
              >
                {isRtl ? '← تستر زنده پورت سریال (UART)' : '→ Open UART Serial Tester'}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('psu_logger')}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 font-medium cursor-pointer"
              >
                {isRtl ? '← لاگر نوسان پاور (P21/P221B)' : '→ Open PSU Real-Time Logger'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'diagnostics' && (
          <div className="space-y-6">
            {/* Miner Selector */}
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-medium text-slate-300">
                  {isRtl ? 'دستگاه مورد بررسی:' : 'Inspected Device:'}
                </label>
                <select
                  value={inspectedMiner?.id || ''}
                  onChange={(e) => setInspectedMinerId(e.target.value)}
                  className="px-3 py-1.5 rounded-md bg-[#0B0E17] border border-slate-800 text-xs font-mono text-white"
                >
                  {miners.length === 0 && (
                    <option value="">
                      {isRtl ? '— هنوز ماینری اسکن نشده است —' : '— No miner scanned yet —'}
                    </option>
                  )}
                  {miners.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.ip}:{m.port} — {m.model || 'WhatsMiner'} ({formatVal(m.hashrateRtTh, ' TH/s')})
                    </option>
                  ))}
                </select>
              </div>

              {inspectedMiner && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
                  <span>SN: {formatVal(inspectedMiner.serialNo)}</span>
                  <span>·</span>
                  <span>CB: {formatVal(inspectedMiner.controlBoard)}</span>
                  <span>·</span>
                  <span>FW: {formatVal(inspectedMiner.firmware)}</span>
                  <span>·</span>
                  <span>RTT: {inspectedMiner.latencyMs}ms</span>
                </div>
              )}
            </div>

            {inspectedMiner ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left 7 Cols: Exact Hashboard (edevs) & PSU (get_psu) Fields */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-white">
                      {isRtl
                        ? 'مقادیر دقیق دریافتی از هش‌بردها (دستور edevs / devs)'
                        : 'Exact Hashboard Telemetry (from edevs / devs)'}
                    </h3>

                    {inspectedMiner.hashboards.length === 0 ? (
                      <p className="text-xs text-slate-400">
                        {isRtl
                          ? 'پاسخ edevs/devs از این دستگاه شامل اطلاعات اسلات نبود.'
                          : 'No DEVS array returned by this miner.'}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {inspectedMiner.hashboards.map((board) => {
                          const isCurrent = board.slot === (inspectedBoard?.slot ?? 0);
                          return (
                            <div
                              key={board.slot}
                              onClick={() => setSelectedSlot(board.slot)}
                              className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                                isCurrent
                                  ? 'bg-[#0B0E17] border-cyan-400'
                                  : 'bg-[#0B0E17]/60 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between font-mono">
                                <span className="text-sm font-bold text-white">
                                  SM{board.slot}
                                </span>
                                <span className="text-xs text-cyan-400">
                                  {formatVal(board.status)}
                                </span>
                              </div>

                              <div className="mt-3 space-y-1.5 text-xs font-mono tabular-nums">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">HS RT:</span>
                                  <span className="text-white font-semibold">
                                    {formatVal(board.hashrateRtTh, ' TH/s')}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">MHS av:</span>
                                  <span className="text-slate-200">
                                    {formatVal(board.mhsAv)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Effective Chips:</span>
                                  <span className="text-emerald-400 font-semibold">
                                    {formatVal(board.effectiveChips)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Chip Freq:</span>
                                  <span className="text-slate-200">
                                    {formatVal(board.freqMhz, ' MHz')}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">PCB Temp:</span>
                                  <span className="text-slate-200">
                                    {formatVal(board.pcbTemp, ' °C')}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Chip Min/Avg/Max:</span>
                                  <span className="text-slate-200">
                                    {formatVal(board.chipTempMin)} / {formatVal(board.chipTempAvg)} /{' '}
                                    {formatVal(board.chipTempMax)} °C
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Combo CRC / HW Err:</span>
                                  <span className="text-amber-400">
                                    {formatVal(board.crcErrors)} / {formatVal(board.hardwareErrors)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">PCB SN:</span>
                                  <span className="text-slate-300">
                                    {formatVal(board.serialNo)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Exact Raw JSON returned by Miner for Selected Hashboard */}
                    {inspectedBoard && (
                      <div className="pt-3 border-t border-slate-800 space-y-1.5">
                        <div className="text-xs font-mono text-slate-400">
                          {isRtl
                            ? `پکت JSON خام دریافتی از ماینر برای اسلات SM${inspectedBoard.slot}:`
                            : `Exact Raw JSON Packet from Miner for Slot SM${inspectedBoard.slot}:`}
                        </div>
                        <pre
                          dir="ltr"
                          className="p-3 rounded bg-[#0B0E17] border border-slate-800 text-[11px] font-mono text-cyan-300 overflow-auto max-h-48"
                        >
                          {JSON.stringify(inspectedBoard.rawFields, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* Exact PSU Telemetry from get_psu */}
                  <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-white">
                      {isRtl
                        ? 'مقادیر دقیق دریافتی از پاور (دستور get_psu)'
                        : 'Exact PSU Telemetry (from get_psu)'}
                    </h3>
                    {inspectedMiner.psu ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
                        <div className="p-3 rounded bg-[#0B0E17] border border-slate-800">
                          <div className="text-slate-400">Model / Version</div>
                          <div className="text-white font-semibold mt-1">
                            {formatVal(inspectedMiner.psu.model)} ({formatVal(inspectedMiner.psu.version)})
                          </div>
                        </div>
                        <div className="p-3 rounded bg-[#0B0E17] border border-slate-800">
                          <div className="text-slate-400">Vin (AC)</div>
                          <div className="text-white font-semibold mt-1">
                            {formatVal(inspectedMiner.psu.vin, ' V')}
                          </div>
                        </div>
                        <div className="p-3 rounded bg-[#0B0E17] border border-slate-800">
                          <div className="text-slate-400">Vout (mV)</div>
                          <div className="text-cyan-400 font-semibold mt-1">
                            {formatVal(inspectedMiner.psu.voutMv, ' mV')}
                          </div>
                        </div>
                        <div className="p-3 rounded bg-[#0B0E17] border border-slate-800">
                          <div className="text-slate-400">Iout / Pin</div>
                          <div className="text-white font-semibold mt-1">
                            {formatVal(inspectedMiner.psu.ioutA, ' A')} · {formatVal(inspectedMiner.psu.pinW, ' W')}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {isRtl
                          ? 'پکت get_psu برای این ورودی ارسال نشده یا پشتیبانی نمی‌شود.'
                          : 'No get_psu packet present for this entry.'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right 5 Cols: Engineering Signal Chain & Voltage Domain Calculator */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        {isRtl
                          ? 'محاسبه‌گر مهندسی زنجیره سیگنال (RI/RO) و ولتاژ دامین هش‌برد'
                          : 'Hashboard Signal Chain (RI/RO) & Voltage Domain Calculator'}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {isRtl
                          ? 'بر اساس تعداد دقیق چیپ‌های شناسایی‌شده (Effective Chips) و ولتاژ پاور، شماره دامین و چیپ مشکوک به قطعی سیگنال را محاسبه می‌کند.'
                          : 'Calculates the exact voltage domain and suspect ASIC chip pair based on real Effective Chips count and PSU Vout.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1">
                          {isRtl ? 'تعداد کل چیپ‌های برد' : 'Total Chips on PCB'}
                        </label>
                        <input
                          type="number"
                          value={calcTotalChips}
                          onChange={(e) => setCalcTotalChips(Number(e.target.value))}
                          className="w-full px-3 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">
                          {isRtl ? 'چیپ‌های شناسایی‌شده (Effective)' : 'Detected Effective Chips'}
                        </label>
                        <input
                          type="number"
                          value={calcDetectedChips}
                          onChange={(e) => setCalcDetectedChips(Number(e.target.value))}
                          className="w-full px-3 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-cyan-400"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">
                          {isRtl ? 'ولتاژ خروجی پاور (Vout V)' : 'Measured PSU Vout (V)'}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={calcPsuVoltageV}
                          onChange={(e) => setCalcPsuVoltageV(Number(e.target.value))}
                          className="w-full px-3 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">
                          {isRtl ? 'تعداد چیپ در هر دامین' : 'Chips per Domain'}
                        </label>
                        <input
                          type="number"
                          value={calcChipsPerDomain}
                          onChange={(e) => setCalcChipsPerDomain(Number(e.target.value))}
                          className="w-full px-3 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                        />
                      </div>
                    </div>

                    <div className="p-4 rounded bg-[#0B0E17] border border-slate-800 space-y-2.5 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-slate-400">
                          {isRtl ? 'تعداد کل دامین‌های ولتاژی:' : 'Total Voltage Domains:'}
                        </span>
                        <span className="text-white font-semibold">
                          {domainMath.totalDomains} Domains
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">
                          {isRtl ? 'ولتاژ استاندارد هر دامین:' : 'Expected Voltage / Domain:'}
                        </span>
                        <span className="text-cyan-400 font-semibold">
                          ~{domainMath.expectedDomainMv} mV ({(domainMath.expectedDomainMv / 1000).toFixed(3)} V)
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-slate-800 pt-2">
                        <span className="text-slate-400">
                          {isRtl ? 'محل احتمالی قطع زنجیره سیگنال:' : 'Suspect Signal Break Point:'}
                        </span>
                        <span
                          className={
                            domainMath.isComplete
                              ? 'text-emerald-400 font-semibold'
                              : 'text-rose-400 font-bold'
                          }
                        >
                          {domainMath.isComplete
                            ? isRtl
                              ? 'زنجیره کامل است'
                              : 'Chain Complete'
                            : `U${domainMath.suspectChipA} ↔ U${domainMath.suspectChipB} (Domain #${domainMath.suspectDomain})`}
                        </span>
                      </div>
                    </div>

                    {!domainMath.isComplete && (
                      <div className="text-xs text-slate-300 space-y-1.5 leading-relaxed">
                        <div className="font-semibold text-amber-300">
                          {isRtl
                            ? `راهنمای تست با مولتی‌متر در دامین #${domainMath.suspectDomain}:`
                            : `Multimeter Test Procedure at Domain #${domainMath.suspectDomain}:`}
                        </div>
                        <p>
                          {isRtl
                            ? `۱. ابتدا ولتاژ رگولاتور LDO 1.8V و PLD 0.8V مربوط به دامین #${domainMath.suspectDomain} (چیپ U${domainMath.suspectChipB}) را اندازه بگیرید.`
                            : `1. Measure the 1.8V LDO and 0.8V PLD regulators feeding Domain #${domainMath.suspectDomain} (Chip U${domainMath.suspectChipB}).`}
                        </p>
                        <p>
                          {isRtl
                            ? `۲. اگر ولتاژ 1.8V برقرار است، تست‌پوینت RO روی چیپ U${domainMath.suspectChipB} و RI روی چیپ U${domainMath.suspectChipA} را بررسی کنید (باید حدود 1.8V باشد).`
                            : `2. Verify RO on Chip U${domainMath.suspectChipB} and RI on Chip U${domainMath.suspectChipA} (expected ~1.8V).`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 bg-[#111827] border border-slate-800 rounded-lg">
                {isRtl
                  ? 'برای مشاهده کالبدشکافی دقیق، ابتدا در تب اول به یک ماینر واقعی متصل شوید یا خروجی واقعی UART/JSON هش‌برد را وارد کنید.'
                  : 'Connect to a real miner on TCP 4028 or import a real UART/JSON log in the first tab to inspect board telemetry.'}
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            TAB 3: ERROR CODE DATABASE & REPAIR BENCH TICKET LOGBOOK
        ===================================================================== */}
        {activeTab === 'repairs' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {isRtl
                    ? 'بانک جامع کدهای خطای واتس‌ماینر و راهنمای تعمیرکار'
                    : 'WhatsMiner Hardware Error Code Reference & Repair Guide'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isRtl
                    ? 'جستجو بر اساس شماره کد خطا (مثلاً 110، 200، 202، 206، 231، 301، 540، 541، 560) یا قطعه معیوب.'
                    : 'Search by error code number or hardware symptom.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 left-3 rtl:left-auto rtl:right-3" />
                  <input
                    type="text"
                    value={errorSearchQuery}
                    onChange={(e) => setErrorSearchQuery(e.target.value)}
                    placeholder={
                      isRtl
                        ? 'جستجوی کد خطا (مثلاً 541، 206، LDO، EEPROM)...'
                        : 'Search code (541, 206, LDO, EEPROM)...'
                    }
                    className="w-full pl-8 pr-3 rtl:pl-3 rtl:pr-8 py-1.5 rounded-md bg-[#0B0E17] border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <select
                  value={errorCategoryFilter}
                  onChange={(e) => setErrorCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-md bg-[#0B0E17] border border-slate-800 text-xs text-slate-200"
                >
                  <option value="ALL">{isRtl ? 'همه بخش‌ها' : 'All Subsystems'}</option>
                  <option value="HASHBOARD">{isRtl ? 'هش‌برد و چیپ (5xx)' : 'Hashboard (5xx)'}</option>
                  <option value="PSU">{isRtl ? 'پاور (2xx)' : 'PSU (2xx)'}</option>
                  <option value="FAN">{isRtl ? 'فن و تهویه (1xx)' : 'Fans (1xx)'}</option>
                  <option value="TEMP">{isRtl ? 'دما و سنسورها (23x/35x)' : 'Temperature'}</option>
                  <option value="EEPROM">{isRtl ? 'آی‌سی ایپروم (30x)' : 'EEPROM (30x)'}</option>
                </select>
              </div>

              <div className="divide-y divide-slate-800 border-t border-slate-800 max-h-[620px] overflow-y-auto pr-1">
                {filteredErrors.map((err) => (
                  <div key={err.code} className="py-4 space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-bold font-mono text-cyan-400">
                          Code {err.code}
                        </span>
                        <span className="text-sm font-semibold text-white">
                          {isRtl ? err.titleFa : err.titleEn}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-mono ${
                          err.severity === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'
                        }`}
                      >
                        {err.category} · {err.severity}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      <strong className="text-slate-100">
                        {isRtl ? 'علت فنی: ' : 'Root Cause: '}
                      </strong>
                      {isRtl ? err.causeFa : err.causeEn}
                    </p>

                    <div className="text-xs font-mono text-cyan-300 bg-[#0B0E17] px-3 py-1.5 rounded border border-slate-800">
                      {isRtl ? 'نقاط تست مولتی‌متر: ' : 'Test Points: '}
                      {err.testPoints}
                    </div>

                    <ol className="list-decimal list-inside space-y-1 text-xs text-slate-300 pt-1">
                      {(isRtl ? err.repairStepsFa : err.repairStepsEn).map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>

            {/* Right 5 Cols: Persistent Repair Bench Ticket Logbook */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    {isRtl
                      ? 'ثبت کارت تعمیرات هش‌برد و پاور (ذخیره در فایل setting/repair_tickets.json)'
                      : 'Repair Bench Measurement & Ticket Logbook'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isRtl
                      ? 'ثبت ولتاژهای اندازه‌گیری‌شده توسط تعمیرکار و سوابق تعویض قطعه.'
                      : 'Record real bench voltage measurements and replaced ASIC chips.'}
                  </p>
                </div>

                <form onSubmit={handleCreateRepairTicket} className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-slate-400 mb-1">
                        {isRtl ? 'نام مشتری / فارم' : 'Customer / Farm'}
                      </label>
                      <input
                        type="text"
                        required
                        value={ticketForm.customerName}
                        onChange={(e) =>
                          setTicketForm({ ...ticketForm, customerName: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">
                        {isRtl ? 'مدل دستگاه' : 'Miner Model'}
                      </label>
                      <input
                        type="text"
                        value={ticketForm.minerModel}
                        onChange={(e) =>
                          setTicketForm({ ...ticketForm, minerModel: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-slate-400 mb-1">
                        {isRtl ? 'سریال هش‌برد / پاور' : 'Board SN'}
                      </label>
                      <input
                        type="text"
                        value={ticketForm.boardSn}
                        onChange={(e) =>
                          setTicketForm({ ...ticketForm, boardSn: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">
                        {isRtl ? 'مدل چیپ ASIC' : 'ASIC Chip Type'}
                      </label>
                      <input
                        type="text"
                        value={ticketForm.chipType}
                        onChange={(e) =>
                          setTicketForm({ ...ticketForm, chipType: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">
                        {isRtl ? 'کد خطا' : 'Error Code'}
                      </label>
                      <input
                        type="text"
                        value={ticketForm.errorCode}
                        onChange={(e) =>
                          setTicketForm({ ...ticketForm, errorCode: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-slate-400 mb-1">LDO 1.8V</label>
                      <input
                        type="text"
                        value={ticketForm.ldo1v8}
                        onChange={(e) =>
                          setTicketForm({ ...ticketForm, ldo1v8: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">PLD 0.8V</label>
                      <input
                        type="text"
                        value={ticketForm.pld0v8}
                        onChange={(e) =>
                          setTicketForm({ ...ticketForm, pld0v8: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">
                        {isRtl ? 'چیپ معیوب' : 'Faulty Chip'}
                      </label>
                      <input
                        type="text"
                        value={ticketForm.faultyChipNo}
                        onChange={(e) =>
                          setTicketForm({ ...ticketForm, faultyChipNo: e.target.value })
                        }
                        className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">
                      {isRtl ? 'شرح تعمیرات انجام‌شده' : 'Repair Action Taken'}
                    </label>
                    <input
                      type="text"
                      value={ticketForm.actionTaken}
                      onChange={(e) =>
                        setTicketForm({ ...ticketForm, actionTaken: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 px-4 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold cursor-pointer"
                  >
                    {isRtl ? 'ثبت در دفترچه تعمیرات کارگاه' : 'Save Repair Bench Record'}
                  </button>
                </form>

                <div className="pt-3 border-t border-slate-800 space-y-2.5">
                  <div className="text-xs font-semibold text-slate-300">
                    {isRtl
                      ? `سوابق ثبت‌شده (${repairTickets.length} مورد)`
                      : `Recorded Bench Tickets (${repairTickets.length})`}
                  </div>
                  {repairTickets.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      {isRtl
                        ? 'هنوز کارت تعمیری ثبت نشده است.'
                        : 'No repair tickets saved yet.'}
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-800 max-h-64 overflow-y-auto">
                      {repairTickets.map((t) => (
                        <div key={t.id} className="py-2.5 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white">
                              {t.customerName} — {t.minerModel}
                            </span>
                            <button
                              onClick={() => handleDeleteRepairTicket(t.id)}
                              className="text-slate-500 hover:text-rose-400 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="font-mono text-[11px] text-cyan-400">
                            SN: {t.boardSn} · Chip: {t.faultyChipNo} · Err: {t.errorCode}
                          </div>
                          <div className="text-slate-400">{t.actionTaken}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 4 & 5 SWITCHER: POOLS / RAW TCP API & DISK CONFIG / LOGS
        ===================================================================== */}
        {(activeTab === 'pools_api' || activeTab === 'settings') && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111827] border border-slate-800 rounded-lg p-3">
            <div className="flex items-center gap-1 p-1 bg-[#0B0E17] border border-slate-800 rounded-md text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('pools_api')}
                className={`px-3 py-1.5 rounded transition-colors cursor-pointer ${
                  activeTab === 'pools_api'
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isRtl
                  ? 'مدیریت استخرها و ترمینال دستورات TCP 4028'
                  : 'Stratum Pools & Raw TCP 4028 Console'}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`px-3 py-1.5 rounded transition-colors cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isRtl
                  ? 'فایل‌های تنظیمات دیسک (system.ini / log.conf) و لاگ‌ها'
                  : 'Disk Config (system.ini / log.conf) & Runtime Logs'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'pools_api' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {isRtl
                    ? 'تنظیم گروهی استخرها با پروتکل رمزنگاری رسمی واتس‌ماینر [POOLS]'
                    : 'Batch Stratum Pool Provisioning (Authenticated get_token AES-256)'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isRtl
                    ? `ارسال واقعی دستور update_pools به ${selectedMinerIds.length} ماینر انتخاب‌شده و ذخیره در فایل setting/system.ini.`
                    : `Send real update_pools TCP command to ${selectedMinerIds.length} selected miner(s) and persist in setting/system.ini.`}
                </p>
              </div>

              <div className="space-y-3 text-xs">
                {[1, 2, 3].map((idx) => {
                  const urlKey = `PoolUrl${idx}` as keyof SystemIniConfig;
                  const workerKey = `Worker${idx}` as keyof SystemIniConfig;
                  const ipCheckKey = `IPCheck${idx}` as keyof SystemIniConfig;
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-md bg-[#0B0E17] border border-slate-800 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">
                          {isRtl ? `استخر شماره ${idx} (Pool ${idx})` : `Stratum Pool #${idx}`}
                        </span>
                        <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(systemIni[ipCheckKey])}
                            onChange={(e) =>
                              setSystemIni({
                                ...systemIni,
                                [ipCheckKey]: e.target.checked ? 1 : 0,
                              })
                            }
                            className="rounded border-slate-700 text-cyan-500"
                          />
                          <span>
                            {isRtl ? 'افزودن پسوند آی‌پی به ورکر' : 'Append IP Suffix'}
                          </span>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            value={String(systemIni[urlKey] || '')}
                            onChange={(e) =>
                              setSystemIni({ ...systemIni, [urlKey]: e.target.value })
                            }
                            placeholder="stratum+tcp://btc.viabtc.io:3333"
                            className="w-full px-2.5 py-1.5 rounded bg-[#111827] border border-slate-800 font-mono text-white"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            value={String(systemIni[workerKey] || '')}
                            onChange={(e) =>
                              setSystemIni({ ...systemIni, [workerKey]: e.target.value })
                            }
                            placeholder="Worker prefix"
                            className="w-full px-2.5 py-1.5 rounded bg-[#111827] border border-slate-800 font-mono text-cyan-300"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex items-center justify-between pt-2">
                  <select
                    value={systemIni.IPSuffixSel}
                    onChange={(e) =>
                      setSystemIni({ ...systemIni, IPSuffixSel: Number(e.target.value) })
                    }
                    className="px-3 py-2 rounded bg-[#0B0E17] border border-slate-800 text-xs text-slate-200"
                  >
                    <option value={2}>
                      {isRtl ? 'پسوند دو بخش آخر آی‌پی (.1x105)' : 'Last 2 Octets (.1x105)'}
                    </option>
                    <option value={1}>
                      {isRtl ? 'پسوند بخش آخر آی‌پی (.105)' : 'Last 1 Octet (.105)'}
                    </option>
                    <option value={0}>
                      {isRtl ? 'بدون پسوند آی‌پی' : 'No IP Suffix'}
                    </option>
                  </select>

                  <button
                    onClick={async () => {
                      await handleSaveConfigToDisk();
                      await executeBatchCommand(
                        (m) => ({
                          cmd: 'update_pools',
                          pool1: systemIni.PoolUrl1,
                          worker1: computeWorkerName(
                            systemIni.Worker1,
                            m.ip,
                            systemIni.IPCheck1
                          ),
                          passwd1: systemIni.Pwd1,
                          pool2: systemIni.PoolUrl2,
                          worker2: computeWorkerName(
                            systemIni.Worker2,
                            m.ip,
                            systemIni.IPCheck2
                          ),
                          passwd2: systemIni.Pwd2,
                          pool3: systemIni.PoolUrl3,
                          worker3: computeWorkerName(
                            systemIni.Worker3,
                            m.ip,
                            systemIni.IPCheck3
                          ),
                          passwd3: systemIni.Pwd3,
                        }),
                        'دستور update_pools ارسال شد',
                        'Sent update_pools command'
                      );
                    }}
                    className="px-4 py-2 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer"
                  >
                    {isRtl
                      ? `اعمال استخرها روی ${selectedMinerIds.length} دستگاه`
                      : `Apply Pools to ${selectedMinerIds.length} Miner(s)`}
                  </button>
                </div>
              </div>
            </div>

            {/* Right 6 Cols: Raw TCP 4028 JSON-RPC Technician Terminal */}
            <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  {isRtl
                    ? 'ترمینال مستقیم دستورات API واتس‌ماینر (TCP Port 4028 JSON-RPC)'
                    : 'Direct WhatsMiner TCP 4028 JSON-RPC Console'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isRtl
                    ? 'ارسال مستقیم پکت JSON به پورت 4028 ماینر (با پشتیبانی خودکار از get_token و رمزنگاری AES-256-ECB برای دستورات نوشتنی).'
                    : 'Send raw JSON commands over TCP 4028 (with automatic get_token + AES-256-ECB signing for write commands).'}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="col-span-2">
                  <label className="block text-slate-400 mb-1">
                    {isRtl ? 'آدرس IP هدف' : 'Target IP'}
                  </label>
                  <input
                    type="text"
                    value={apiTargetIp}
                    onChange={(e) => setApiTargetIp(e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    {isRtl ? 'پورت TCP' : 'Port'}
                  </label>
                  <input
                    type="number"
                    value={apiTargetPort}
                    onChange={(e) => setApiTargetPort(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'summary', cmd: '{"cmd":"summary"}' },
                  { label: 'edevs', cmd: '{"cmd":"edevs"}' },
                  { label: 'devs', cmd: '{"cmd":"devs"}' },
                  { label: 'get_psu', cmd: '{"cmd":"get_psu"}' },
                  { label: 'get_error_code', cmd: '{"cmd":"get_error_code"}' },
                  { label: 'pools', cmd: '{"cmd":"pools"}' },
                  { label: 'get_miner_info', cmd: '{"cmd":"get_miner_info"}' },
                  { label: 'get_version', cmd: '{"cmd":"get_version"}' },
                  { label: 'status', cmd: '{"cmd":"status"}' },
                  { label: 'get_token', cmd: '{"cmd":"get_token"}' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handleSendRawApi(preset.cmd)}
                    className="px-2.5 py-1 rounded bg-[#0B0E17] hover:bg-slate-800 border border-slate-800 text-xs font-mono text-cyan-300 cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={apiJsonInput}
                  onChange={(e) => setApiJsonInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded bg-[#0B0E17] border border-slate-800 text-xs font-mono text-white"
                />
                <button
                  onClick={() => handleSendRawApi()}
                  disabled={isSendingApi}
                  className="px-4 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isRtl ? 'ارسال دستور' : 'Send'}</span>
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span>{isRtl ? 'پاسخ خام دریافتی از سوکت TCP:' : 'Raw TCP Socket Response:'}</span>
                  {apiLatencyMs !== null && (
                    <span>
                      RTT: {apiLatencyMs} ms · {apiEncryptedUsed ? 'AES-256-ECB' : 'Plain JSON'}
                    </span>
                  )}
                </div>
                <pre
                  dir="ltr"
                  className="p-3 rounded bg-[#0B0E17] border border-slate-800 text-xs font-mono text-emerald-300 overflow-auto max-h-64"
                >
                  {apiResponseText || '// Ready to send real TCP 4028 JSON-RPC command'}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            TAB 5: REAL DISK CONFIG (setting/system.ini & setting/log.conf) + LOGS
        ===================================================================== */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">
                  {isRtl
                    ? 'ویرایش فایل واقعی setting/system.ini'
                    : 'Edit Disk setting/system.ini'}
                </h2>
                <button
                  onClick={handleSaveConfigToDisk}
                  className="px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer"
                >
                  {isRtl ? 'ذخیره روی دیسک' : 'Save to Disk'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">
                    AccountName (admin / super)
                  </label>
                  <input
                    type="text"
                    value={systemIni.AccountName}
                    onChange={(e) =>
                      setSystemIni({ ...systemIni, AccountName: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    MinerTimeout (ms)
                  </label>
                  <input
                    type="number"
                    value={systemIni.MinerTimeout}
                    onChange={(e) =>
                      setSystemIni({ ...systemIni, MinerTimeout: Number(e.target.value) })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    AutoScanInterval (sec)
                  </label>
                  <input
                    type="number"
                    value={systemIni.AutoScanInterval}
                    onChange={(e) =>
                      setSystemIni({
                        ...systemIni,
                        AutoScanInterval: Number(e.target.value),
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    MinerConnections
                  </label>
                  <input
                    type="number"
                    value={systemIni.MinerConnections}
                    onChange={(e) =>
                      setSystemIni({
                        ...systemIni,
                        MinerConnections: Number(e.target.value),
                      })
                    }
                    className="w-full px-2.5 py-1.5 rounded bg-[#0B0E17] border border-slate-800 font-mono text-white"
                  />
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-1 font-mono">
                  /setting/system.ini
                </div>
                <pre
                  dir="ltr"
                  className="p-3 rounded bg-[#0B0E17] border border-slate-800 text-[11px] font-mono text-slate-300 overflow-auto max-h-48"
                >
                  {rawSystemIni}
                </pre>
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-1 font-mono">
                  /setting/log.conf
                </div>
                <pre
                  dir="ltr"
                  className="p-3 rounded bg-[#0B0E17] border border-slate-800 text-[11px] font-mono text-slate-300 overflow-auto max-h-40"
                >
                  {rawLogConf}
                </pre>
              </div>
            </div>

            <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    {isRtl
                      ? 'لاگ‌های واقعی سیستم و شبکه (setting/runtime.log)'
                      : 'Real Runtime & TCP Logs (setting/runtime.log)'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    FORMAT: {logConf.format}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    await fetch('/api/logs', { method: 'DELETE' });
                    await refreshLogs();
                  }}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
                >
                  {isRtl ? 'پاک‌سازی لاگ‌ها' : 'Clear Logs'}
                </button>
              </div>

              <div
                dir="ltr"
                className="p-3 rounded bg-[#0B0E17] border border-slate-800 font-mono text-xs space-y-1.5 max-h-[520px] overflow-y-auto"
              >
                {logs.length === 0 ? (
                  <div className="text-slate-500 py-8 text-center">No logs recorded</div>
                ) : (
                  logs.map((entry) => (
                    <div key={entry.id} className="leading-relaxed">
                      <span
                        className={`mr-2 font-semibold ${
                          entry.level === 'ERROR'
                            ? 'text-rose-400'
                            : entry.level === 'DEBUG'
                            ? 'text-amber-400'
                            : 'text-cyan-400'
                        }`}
                      >
                        [{entry.level}]
                      </span>
                      <span className="text-slate-300">
                        {entry.formatted ||
                          `[${entry.process} | ${entry.timestamp}] ${entry.message}`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
