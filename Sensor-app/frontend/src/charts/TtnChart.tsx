import { ResponsiveContainer, LineChart, XAxis, YAxis, Line, Tooltip, Legend, CartesianGrid } from 'recharts';
import type { Reading } from '../types';
import { gridColor } from '../theme';

// Muted, distinguishable colours for the payload fields
const fieldColors = ['#7aa2c8', '#9d8cd6', '#6fb7a8', '#c8a77a', '#a0a6ad'];
const axisText = '#9ba1a9';

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString();

/** LoRaWAN uplinks can contain any fields, so each numeric field of `raw` becomes its own line. */
const TtnChart = ({ readings }: { readings: Reading[] }) => {
    const latest = readings.at(-1)?.raw ?? {};
    const fields = Object.keys(latest).filter(key => typeof latest[key] === 'number');
    if (fields.length === 0) return null;

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={readings} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={gridColor} />
                {fields.map((key, index) => (
                    <Line key={key} type="monotone" dataKey={`raw.${key}`} name={key}
                        stroke={fieldColors[index % fieldColors.length]} dot={false} strokeWidth={1.75} isAnimationActive={false} />
                ))}
                <XAxis dataKey="timestamp" tickFormatter={formatTime} stroke={axisText} fontSize={11} minTickGap={40} />
                <YAxis stroke={axisText} fontSize={11} width={48} />
                <Tooltip labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
                    contentStyle={{ background: '#24282d', border: '1px solid rgba(255,255,255,0.1)', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: axisText }} />
            </LineChart>
        </ResponsiveContainer>
    );
};

export default TtnChart;
