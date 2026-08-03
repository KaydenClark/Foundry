export function PageHeading({ title, description, action, meta }) {
  return (
    <header className="page-heading">
      <div>
        <span>{meta}</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
