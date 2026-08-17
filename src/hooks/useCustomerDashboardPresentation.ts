import { useLocation } from "react-router-dom";

export const isCustomerDashboardPresentation = (search: string) =>
  new URLSearchParams(search).get("presentation") === "dashboard";

const useCustomerDashboardPresentation = () => {
  const { search } = useLocation();

  return isCustomerDashboardPresentation(search);
};

export default useCustomerDashboardPresentation;
