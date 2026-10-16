import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    type ChartData,
    type ChartDataset,
    type ChartOptions,
    type ScriptableScaleContext,
} from 'chart.js';
import {
    ResponsiveContainer,
    LineChart,
    XAxis,
    YAxis,
    Line as RechartsLine,
    Tooltip as RechartsTooltip,
    Legend as RechartsLegend,
} from 'recharts';
import { numericValue, type Reading, type SensorType, type Threshold } from '../types';

// Colors for the TTN payload fields
const colors = ['#ff6384', '#36a2eb', '#4bc0c0', '#ffcd56', '#c9cbcf'];

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

interface WeatherGraphProps {
    data: Reading[];
    type: SensorType;
    threshold?: Threshold;
}

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString();

const dataset = (label: string, values: (number | null)[], color: string, yAxisID: string): ChartDataset<'line'> => ({
    tension: 0.4,
    fill: true,
    borderColor: color,
    backgroundColor: `${color}20`,
    pointRadius: 2,
    pointHoverRadius: 5,
    pointBackgroundColor: color,
    pointHoverBackgroundColor: color,
    pointBorderColor: '#fff',
    pointHoverBorderColor: '#fff',
    label,
    data: values,
    yAxisID,
});

const axisTicks = { color: '#6c757d' };

const WeatherGraph = ({ data, type, threshold }: WeatherGraphProps) => {
    if (type === 'TTN') {
        return <TtnGraph data={data} />;
    }

    const isWeather = type === 'WeatherApi';

    const chartData: ChartData<'line'> = {
        labels: data.map(d => formatTime(d.timestamp)),
        datasets: isWeather
            ? [
                dataset('Temperature', data.map(d => d.temp ?? null), '#ff6384', 'temperature'),
                dataset('Humidity', data.map(d => d.humidity ?? null), '#36a2eb', 'humidity'),
            ]
            : [dataset('Value', data.map(d => numericValue(d) ?? null), '#4bc0c0', 'value')],
    };

    // Highlight the grid lines that fall exactly on the warning / critical thresholds
    const thresholdGridColor = (context: ScriptableScaleContext) => {
        const tick = context.tick?.value;
        if (threshold?.critical !== undefined && tick === threshold.critical) return 'red';
        if (threshold?.warning !== undefined && tick === threshold.warning) return 'orange';
        return '#e9ecef';
    };

    const options: ChartOptions<'line'> = {
        responsive: true,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    usePointStyle: true,
                    padding: 20,
                    color: '#6c757d',
                },
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                titleColor: '#000',
                bodyColor: '#666',
                borderColor: '#ddd',
                borderWidth: 1,
                padding: 10,
                displayColors: true,
                callbacks: {
                    label: (context) => {
                        let label = context.dataset.label ? `${context.dataset.label}: ` : '';
                        if (context.parsed.y !== null) {
                            label += context.parsed.y.toFixed(1);
                            if (isWeather) {
                                label += (context.dataset as ChartDataset<'line'>).yAxisID === 'temperature' ? '°C' : '%';
                            } else if (threshold?.unit) {
                                label += threshold.unit;
                            }
                        }
                        return label;
                    },
                },
            },
        },
        scales: isWeather
            ? {
                x: { grid: { display: false }, ticks: axisTicks },
                temperature: {
                    type: 'linear',
                    position: 'left',
                    grid: { color: '#e9ecef' },
                    ticks: axisTicks,
                    title: { display: true, text: 'Temperature (°C)', color: '#6c757d' },
                },
                humidity: {
                    type: 'linear',
                    position: 'right',
                    grid: { display: false },
                    ticks: axisTicks,
                    title: { display: true, text: 'Humidity (%)', color: '#6c757d' },
                },
            }
            : {
                x: { grid: { display: false }, ticks: axisTicks },
                value: {
                    type: 'linear',
                    position: 'left',
                    grid: { color: thresholdGridColor },
                    ticks: axisTicks,
                    title: {
                        display: true,
                        text: `Value${threshold?.unit ? ` (${threshold.unit})` : ''}`,
                        color: '#6c757d',
                    },
                },
            },
    };

    return (
        <div className="weather-graph">
            <Line data={chartData} options={options} />
        </div>
    );
};

/** TTN uplinks can contain any fields, so each field of `raw` becomes its own line. */
const TtnGraph = ({ data }: { data: Reading[] }) => {
    if (data.length === 0) return null;

    const fields = Object.keys(data[data.length - 1].raw ?? {});

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
                {fields.map((key, index) => (
                    <RechartsLine
                        key={key}
                        type="monotone"
                        dataKey={`raw.${key}`}
                        stroke={colors[index % colors.length]}
                        name={key}
                        dot={false}
                    />
                ))}
                <XAxis dataKey="timestamp" tickFormatter={formatTime} />
                <YAxis />
                <RechartsTooltip labelFormatter={(timestamp) => new Date(Number(timestamp)).toLocaleString()} />
                <RechartsLegend />
            </LineChart>
        </ResponsiveContainer>
    );
};

export default WeatherGraph;
