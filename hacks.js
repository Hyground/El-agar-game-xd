(function() {
    const triggerKey = 'F2';
    let visible = false;

    const panel = document.createElement('div');
    panel.style = `position:fixed; bottom:20px; right:20px; background:rgba(20,0,0,0.9); border:2px solid red; padding:20px; color:white; font-family:monospace; display:none; z-index:1000; box-shadow:0 0 20px red;`;
    panel.innerHTML = `
        <h3 style="color:red; text-align:center; margin:0 0 15px 0;">ADMIN PANEL</h3>
        <button onclick="socket.emit('adminAction', {type:'mass', value:1000})" style="width:100%; margin-bottom:5px;">+1000 MASA</button>
        <button onclick="socket.emit('adminAction', {type:'mass', value:-500})" style="width:100%; margin-bottom:5px;">-500 MASA</button>
        <button onclick="socket.emit('adminAction', {type:'teleport', x:10000, y:10000})" style="width:100%; margin-bottom:5px;">CENTRO</button>
        <button onclick="socket.emit('adminAction', {type:'speed', value:4})" style="width:100%; margin-bottom:5px;">TURBO (10s)</button>
        <p style="font-size:10px; text-align:center;">PRESIONA F2 PARA CERRAR</p>
    `;
    document.body.appendChild(panel);

    window.addEventListener('keydown', (e) => {
        if(e.key === triggerKey) {
            visible = !visible;
            panel.style.display = visible ? 'block' : 'none';
        }
    });
})();