import { useEffect, useState } from "react";
import contractorApi from "../services/contractorApi";

/**
 * How many paid site-visit requests are waiting for THIS contractor to answer.
 *
 * The contractor app has no notification inbox, so a request that is only in the
 * "Package visits" list is invisible to anyone who is looking at Home or Enquiries.
 * This count lets those screens say "you have work waiting" and link straight to it.
 *
 * A failure quietly reads as zero: it is an alert, and an alert that errors should
 * not take the screen it sits on down with it.
 */
export default function usePackageVisitCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    contractorApi
      .listPackageRequests({ limit: 50 })
      .then(({ rows }) => {
        if (!cancelled) setCount(rows.filter((row) => row.canRespond).length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
