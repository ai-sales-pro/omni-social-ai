function generate() {
    let customer = document.getElementById("customer").value;
    let product = document.getElementById("product").value;
    let price = document.getElementById("price").value;

    let reply = `Hi! 👋  

Thanks for your interest in ${product}.  

This is a premium solution designed to help you get results quickly 🚀  

The price is ${price}. I can help you get started immediately.  

Let me know if you're ready! 💰`;

    document.getElementById("output").innerText = reply;
}
