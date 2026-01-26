export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const currentYear = now.getFullYear();
  const dateYear = date.getFullYear();
  
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const day = date.getDate();
  
  if (dateYear === currentYear) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${dateYear}`;
};
