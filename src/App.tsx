import { useState } from 'react';
import { DocsSection } from './docs/DocsSection';
import { TestsSection } from './tests/TestsSection';

type Section = 'tests' | 'docs';

export function App() {
  const [section, setSection] = useState<Section>('tests');

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="sidebar-title">Testdoc Studio</div>
        <button className={section === 'tests' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('tests')}>
          Tests
        </button>
        <button className={section === 'docs' ? 'nav-item active' : 'nav-item'} onClick={() => setSection('docs')}>
          Docs
        </button>
      </nav>
      <main className="content">
        <h1>{section === 'tests' ? 'Tests' : 'Docs'}</h1>
        {section === 'tests' ? <TestsSection /> : <DocsSection />}
      </main>
    </div>
  );
}
