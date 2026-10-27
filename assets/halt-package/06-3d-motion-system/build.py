import re
r=lambda f:open(f).read()
strip=lambda s:re.sub(r'if\(typeof module[\s\S]*$','',s)
code='\n'.join(strip(r(f)) for f in ['halt-spec.js','halt-scene-a.js','halt-scene-b.js'])
out=r('head.html')+'\n<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script>\n'+code+'\n'+r('preview.js')+'\n</script>\n'
open('halt-3d.html','w').write(out)
v='../site/vend/node_modules/'
s=out.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>','<script>'+r(v+'three/build/three.min.js')+'</script>')
for u,f in [('react/18.3.1/umd/react.production.min.js','react/umd/react.production.min.js'),('react-dom/18.3.1/umd/react-dom.production.min.js','react-dom/umd/react-dom.production.min.js')]:
    s=s.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/%s"></script>'%u,'<script>'+r(v+f)+'</script>')
s=re.sub(r'<link rel="preconnect".*?rel="stylesheet">','<meta charset="utf-8">',s)
open('halt-3d.local.html','w').write(s)
