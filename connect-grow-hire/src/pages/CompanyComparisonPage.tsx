import { useParams, Navigate } from 'react-router-dom';
import { companies } from '@/data/companies';
import CompanyComparison from './templates/CompanyComparison';

const CompanyComparisonPage = () => {
  const { comparison } = useParams<{ comparison: string }>();

  const parts = comparison?.split('-vs-');
  if (!parts || parts.length !== 2) return <Navigate to="/" replace />;

  const [slugA, slugB] = parts;
  const companyA = companies.find(c => c.slug === slugA);
  const companyB = companies.find(c => c.slug === slugB);

  if (!companyA || !companyB) return <Navigate to="/" replace />;

  return <CompanyComparison companyA={companyA} companyB={companyB} />;
};

export default CompanyComparisonPage;
