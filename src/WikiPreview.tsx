import { useMemo } from 'react';
import { renderWiki, type RenderOptions } from '../shared/wikiMarkup';

interface Props {
  markup: string;
  options?: RenderOptions;
  className?: string;
  // Called with the diagram name (diagram-N) when its preview image is clicked.
  onDiagramClick?: (diagram: string) => void;
}

// renderWiki escapes all text and only emits its own tags, so the HTML is safe to inject.
export function WikiPreview({ markup, options, className, onDiagramClick }: Props) {
  const html = useMemo(() => renderWiki(markup, options), [markup, options]);
  return (
    <div
      className={className ? `wiki ${className}` : 'wiki'}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={
        onDiagramClick &&
        ((e) => {
          const diagram = (e.target as HTMLElement).closest<HTMLElement>('[data-diagram]')?.dataset.diagram;
          if (diagram) onDiagramClick(diagram);
        })
      }
    />
  );
}
