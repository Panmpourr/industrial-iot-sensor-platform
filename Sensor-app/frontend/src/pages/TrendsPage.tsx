import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
    Autocomplete, Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
    ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { ShowChartOutlined } from '@mui/icons-material';
import * as api from '../api';
import { assetFilter, pathText } from '../assets';
import CompareChart, { type CompareSeries } from '../charts/CompareChart';
import { useSensorData } from '../data/SensorDataContext';
import { formatBucket, isRangeKey, ranges, refreshDelay, sourceLabels, summarize } from '../history';
import { formatValue, unitOf } from '../status';
import { assignSlots, groupByUnit, MAX_SERIES, parseSensorIds, seriesColors, spanOf } from '../trends';
import type { History } from '../types';
import AssetSelect from '../ui/AssetSelect';
import EmptyState from '../ui/EmptyState';
import PageHeader from '../ui/PageHeader';

type Scale = 'values' | 'percent';

const historyRanges = ranges.filter(r => r.ms > 0);
const DEFAULT_RANGE = '24h';

const toggleSx = { '& .MuiToggleButton-root': { py: 0.25, px: 1.25, fontSize: '0.75rem', textTransform: 'none' } };

/** Short line in the series colour: the key of a line chart. */
const LineKey = ({ color }: { color: string }) => (
    <Box component="span" sx={{ display: 'inline-block', width: 16, height: 3, borderRadius: 2, bgcolor: color, flexShrink: 0 }} />
);

/** Several sensors on one time axis: one chart per unit, or all of them as % of their range. */
const TrendsPage = () => {
    const { sensors, sensorsLoaded, assets } = useSensorData();
    const [params, setParams] = useSearchParams();
    const rangeParam = params.get('range');
    const range = historyRanges.find(r => r.key === (isRangeKey(rangeParam) ? rangeParam : DEFAULT_RANGE)) ?? historyRanges[1];
    const scale: Scale = params.get('scale') === 'percent' ? 'percent' : 'values';

    // Sensors that can be trended: numeric ones (LoRaWAN payloads have no single value)
    const choices = useMemo(() => Object.entries(sensors)
        .filter(([, s]) => s.type !== 'TTN')
        .map(([id, s]) => ({ id, name: s.name, location: pathText(assets, s.assetId) }))
        .sort((a, b) => (a.location || '￿').localeCompare(b.location || '￿') || a.name.localeCompare(b.name, undefined, { numeric: true })),
    [sensors, assets]);

    // Ids in the link that are not (or no longer) sensors of this site are dropped
    const idsKey = sensorsLoaded
        ? parseSensorIds(params.get('sensors')).filter(id => sensors[id] && sensors[id].type !== 'TTN').join(',')
        : '';
    const ids = useMemo(() => (idsKey ? idsKey.split(',') : []), [idsKey]);

    // A colour stays with its sensor while others are added or removed (updated while rendering,
    // as React recommends for state derived from props)
    const [slots, setSlots] = useState<Record<string, number>>({});
    const [slotsFor, setSlotsFor] = useState('');
    if (slotsFor !== idsKey) {
        setSlotsFor(idsKey);
        setSlots(previous => assignSlots(previous, ids));
    }

    const [histories, setHistories] = useState<Record<string, History>>({});
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (ids.length === 0) {
            setHistories({});
            return;
        }
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const load = async () => {
            setLoading(true);
            // One `to` for every sensor, so all of them get the same buckets
            const to = new Date();
            const from = new Date(to.getTime() - range.ms);
            try {
                const results = await Promise.all(ids.map(id => api.getHistory(id, from, to)));
                if (cancelled) return;
                setHistories(Object.fromEntries(ids.map((id, i) => [id, results[i]])));
                setFailed(false);
                timer = setTimeout(load, refreshDelay(results[0].bucketSeconds));
            } catch {
                if (cancelled) return;
                setFailed(true);
                timer = setTimeout(load, 30_000);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [ids, range.ms]);

    const update = (changes: Record<string, string | null>) => {
        setParams(prev => {
            const next = new URLSearchParams(prev);
            for (const [key, value] of Object.entries(changes)) {
                if (value) next.set(key, value);
                else next.delete(key);
            }
            return next;
        }, { replace: true });
    };
    const setIds = (next: string[]) => update({ sensors: next.slice(0, MAX_SERIES).join(',') || null });

    const addSensorsOf = (assetId: string) => {
        const inside = assetFilter(assets, assetId);
        const added = choices.filter(c => inside(sensors[c.id].assetId) && !ids.includes(c.id)).map(c => c.id);
        setIds([...ids, ...added]);
    };

    // Shown only once the histories match the selection, so lines never pair with the wrong sensor
    const series: CompareSeries[] = ids
        .filter(id => histories[id])
        .map(id => ({
            id,
            sensor: sensors[id],
            color: seriesColors[slots[id] ?? 0],
            points: histories[id].points,
            span: spanOf(sensors[id], histories[id].points),
        }));
    const first = series[0] && histories[series[0].id];
    const groups: [string, CompareSeries[]][] = scale === 'percent' ? [['', series]] : groupByUnit(series);
    const chartHeight = groups.length > 1 ? 240 : 380;

    if (!sensorsLoaded) return null;

    return (
        <>
            <PageHeader
                title="Trends"
                subtitle="Compare sensors over time"
                actions={<>
                    <ToggleButtonGroup size="small" exclusive value={scale} aria-label="Scale" sx={toggleSx}
                        onChange={(_, value: Scale | null) => value && update({ scale: value === 'percent' ? value : null })}>
                        <ToggleButton value="values">Values</ToggleButton>
                        <ToggleButton value="percent">% of range</ToggleButton>
                    </ToggleButtonGroup>
                    <ToggleButtonGroup size="small" exclusive value={range.key} aria-label="Time range" sx={toggleSx}
                        onChange={(_, key: string | null) => key && update({ range: key === DEFAULT_RANGE ? null : key })}>
                        {historyRanges.map(r => <ToggleButton key={r.key} value={r.key}>{r.label}</ToggleButton>)}
                    </ToggleButtonGroup>
                </>}
            />

            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <Autocomplete
                        multiple
                        size="small"
                        sx={{ flexGrow: 1 }}
                        options={choices.map(c => c.id)}
                        value={ids}
                        onChange={(_, value) => setIds(value)}
                        groupBy={id => choices.find(c => c.id === id)?.location || 'Not assigned'}
                        getOptionLabel={id => sensors[id]?.name ?? id}
                        getOptionDisabled={id => ids.length >= MAX_SERIES && !ids.includes(id)}
                        filterSelectedOptions
                        renderTags={(value, getTagProps) => value.map((id, index) => {
                            const { key, ...tagProps } = getTagProps({ index });
                            return (
                                <Chip key={key} {...tagProps} size="small" label={sensors[id]?.name ?? id}
                                    icon={<Box sx={{ display: 'flex', pl: 1 }}><LineKey color={seriesColors[slots[id] ?? 0]} /></Box>} />
                            );
                        })}
                        renderInput={inputProps => (
                            <TextField {...inputProps} label="Sensors"
                                helperText={ids.length >= MAX_SERIES ? `At most ${MAX_SERIES} sensors at once` : `Up to ${MAX_SERIES} sensors`} />
                        )}
                    />
                    {assets.length > 0 && (
                        <AssetSelect assets={assets} label="Add all sensors of" value="" emptyLabel="Choose area or equipment"
                            onChange={value => value && addSensorsOf(value)} sx={{ minWidth: 240 }}
                            helperText="Adds them to the comparison" />
                    )}
                </Stack>
            </Paper>

            {ids.length === 0 ? (
                <EmptyState
                    icon={<ShowChartOutlined sx={{ fontSize: 40, color: 'text.secondary' }} />}
                    title="Pick sensors to compare"
                    message={`Choose up to ${MAX_SERIES} sensors above, or all sensors of a machine or area, to see their trends on one time axis.`}
                />
            ) : (
                <Stack spacing={2} sx={{ opacity: loading && series.length > 0 ? 0.7 : 1, transition: 'opacity 0.2s' }}>
                    {failed && <Typography color="error" variant="body2">Could not load the history. Retrying…</Typography>}
                    {!first && !failed && <Typography color="text.secondary" variant="body2">Loading history…</Typography>}

                    {first && groups.map(([unit, items]) => (
                        <Paper key={unit || 'none'} variant="outlined">
                            <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                                <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                                    {scale === 'percent' ? 'All sensors, as % of their range' : unit ? `In ${unit}` : 'Without unit'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {items.length} sensor{items.length === 1 ? '' : 's'}
                                </Typography>
                            </Stack>
                            <Box sx={{ p: 2, height: chartHeight }}>
                                <CompareChart series={items} from={first.from} to={first.to} bucketMs={first.bucketSeconds * 1000}
                                    scale={scale} unit={unit} />
                            </Box>
                        </Paper>
                    ))}

                    {first && (
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Sensor</TableCell>
                                        <TableCell align="right">Min</TableCell>
                                        <TableCell align="right">Average</TableCell>
                                        <TableCell align="right">Max</TableCell>
                                        <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Readings</TableCell>
                                        {scale === 'percent' && <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>100 % =</TableCell>}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {series.map(s => {
                                        const unit = unitOf(s.sensor);
                                        const summary = summarize(s.points);
                                        const location = pathText(assets, s.sensor.assetId);
                                        return (
                                            <TableRow key={s.id}>
                                                <TableCell>
                                                    <Stack direction="row" spacing={1.25} alignItems="center">
                                                        <LineKey color={s.color} />
                                                        <Box>
                                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.sensor.name}</Typography>
                                                            {location && <Typography variant="caption" color="text.secondary">{location}</Typography>}
                                                        </Box>
                                                    </Stack>
                                                </TableCell>
                                                <TableCell align="right">{formatValue(summary?.min, unit)}</TableCell>
                                                <TableCell align="right">{formatValue(summary?.avg, unit)}</TableCell>
                                                <TableCell align="right">{formatValue(summary?.max, unit)}</TableCell>
                                                <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                                                    {summary ? summary.count.toLocaleString() : 'no data'}
                                                </TableCell>
                                                {scale === 'percent' && (
                                                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, color: 'text.secondary' }}>
                                                        {s.span ? `${formatValue(s.span.min, unit)} … ${formatValue(s.span.max, unit)}${s.span.observed ? ' (seen in period)' : ''}` : '—'}
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {first && (
                        <Typography variant="caption" color="text.secondary">
                            Last {range.label} · each point is the average of {formatBucket(first.bucketSeconds)} · source: {sourceLabels[first.source]}
                            {scale === 'percent' && ' · % of range uses each sensor’s configured min–max'}
                        </Typography>
                    )}
                </Stack>
            )}
        </>
    );
};

export default TrendsPage;
