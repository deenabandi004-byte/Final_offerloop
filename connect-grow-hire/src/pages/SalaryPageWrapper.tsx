import { useParams, Navigate } from 'react-router-dom';
import { salaryData } from '@/data/salary-data';
import SalaryPage from './templates/SalaryPage';

const SalaryPageWrapper = () => {
  const { slug } = useParams<{ slug: string }>();

  const data = salaryData.find(d => d.slug === slug);

  if (!data) return <Navigate to="/" replace />;

  return <SalaryPage data={data} />;
};

export default SalaryPageWrapper;
