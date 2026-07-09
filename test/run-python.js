const { execSync } = require('child_process');
try {
    const output = execSync('python scripts/macronize.py --test', {
        env: { ...process.env, PYTHONPATH: 'python' },
        encoding: 'utf8'
    });
    console.log(output);
} catch (err) {
    console.error(err.stdout || err.message);
}
