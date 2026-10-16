import { trendColor } from '../theme';

interface SparklineProps {
    values: number[];
    width?: number;
    height?: number;
    color?: string;
}

/** Tiny trend line for tables: shows the shape of recent data without axes. */
const Sparkline = ({ values, width = 120, height = 28, color = trendColor }: SparklineProps) => {
    if (values.length < 2) {
        return <svg width={width} height={height} aria-hidden />;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = width / (values.length - 1);
    const points = values
        .map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / range) * (height - 4)).toFixed(1)}`)
        .join(' ');

    return (
        <svg width={width} height={height} aria-hidden>
            <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
        </svg>
    );
};

export default Sparkline;
