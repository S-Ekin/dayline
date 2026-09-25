import '@lark-base-open/js-sdk/dist/style/dashboard.css';
import './App.scss';
import './locales/i18n';
import 'dayjs/locale/zh-cn';
import dayjs from 'dayjs';
import DayLine from './components/DayLine';
import { useTheme } from './hooks';

dayjs.locale('zh-cn');

export default function App() {
  const { bgColor } = useTheme();
  return <DayLine bgColor={bgColor} />;
}
