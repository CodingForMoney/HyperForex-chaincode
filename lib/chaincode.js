'use strict';

const { Contract } = require('fabric-contract-api');

const accountObjType = "Account";
const currencyListKey = "CurrencyList";

class ChainCode extends Contract {

    // admin API:
    // MSPID: Org1MSP, TODO change to admin.
    async addCurrency(ctx, currency, exchangeRateToUSD) {
        if (ctx.clientIdentity.getMSPID() != "Org1MSP") {
            throw new Error(`unauthorized access: only admin can access this function`);
        }
        const _exchangeRateToUSD = parseFloat(exchangeRateToUSD);
        if (_exchangeRateToUSD < 0) {
            throw new Error(`exchangeRateToUSD cannot be set to a negative value`);
        }
        if (await this._currencyExists(ctx, currency)) {
            throw new Error(`currency (${currency}) already exists`);
        }

        const info = {
            currency,
            exchangeRateToUSD: _exchangeRateToUSD
        }

        await this._putCurrency(ctx, info)
    }


    async updateRate(ctx, currency, exchangeRateToUSD) {
        if (ctx.clientIdentity.getMSPID() != "Org1MSP") {
            throw new Error(`unauthorized access: only admin can access this function`);
        }
        const _exchangeRateToUSD = parseFloat(exchangeRateToUSD);
        if (_exchangeRateToUSD < 0) {
            throw new Error(`exchangeRateToUSD cannot be set to a negative value`);
        }
        if (!(await this._currencyExists(ctx, currency))) {
            throw new Error(`can not find currency(${currency})`);
        }

        const info = {
            currency,
            exchangeRateToUSD: _exchangeRateToUSD
        }

        await this._putCurrency(ctx, info)
    }

    async depositMoney(ctx, userID, currency, amount) {
        if (ctx.clientIdentity.getMSPID() != "Org1MSP") {
            throw new Error(`unauthorized access: only admin can access this function`);
        }
        const _amount = parseFloat(amount); 
        if (_amount < 0) {
            throw new Error(`amount cannot be set to a negative value`);
        }
        if (!(await this._currencyExists(ctx, currency))) {
            throw new Error(`can not find currency(${currency})`);
        }
        if (!(await this._accountExists(ctx, userID))) {
            throw new Error(`can not find account ${userID}`);
        }

        let account = await this._getAccount(ctx, userID);
        // undefined means 0.
        let balance = account.balance[currency] || 0
        let newBalance = balance + _amount
        account.balance[currency] = newBalance

        await this._putAccount(ctx, account)
    }



    async withdrawMoney(ctx, userID, currency, amount) {
        if (ctx.clientIdentity.getMSPID() != "Org1MSP") {
            throw new Error(`unauthorized access: only admin can access this function`);
        }
        const _amount = parseFloat(amount); 
        if (_amount < 0) {
            throw new Error(`amount cannot be set to a negative value`);
        }
        if (!(await this._currencyExists(ctx, currency))) {
            throw new Error(`can not find currency(${currency})`);
        }
        if (!(await this._accountExists(ctx, userID))) {
            throw new Error(`can not find account ${userID}`);
        }

        let account = await this._getAccount(ctx, userID);
        // undefined means 0.
        let balance = account.balance[currency] || 0
        if (balance < _amount) {
            throw new Error(`amount cannot be more than the current account balance`);
        }
        let newBalance = balance - _amount
        account.balance[currency] = newBalance

        await this._putAccount(ctx, account)
    }


    // User API

    // must call this function to init account.
    async initAccount(ctx, userID) {
        const account = {
            id: userID,
            owner: ctx.clientIdentity.getID(),
            balance: {
                // if can't find balance of a currency, it means the balance of that currency is zero.
            }
        }

        if (await this._accountExists(ctx, account.id)) {
            throw new Error(`the account ${account.id} already exists`);
        }

        await this._putAccount(ctx, account);
    }

    async transfer(ctx, idFrom, idTo, currency, amount) {
        const amountToTransfer = parseFloat(amount);
        if (amountToTransfer < 0) {
            throw new Error(`amount to transfer cannot be negative`);
        }
        if (!(await this._currencyExists(ctx, currency))) {
            throw new Error(`can not find currency(${currency})`);
        }

        let accountFrom = await this._getAccount(ctx, idFrom);

        if (accountFrom.owner !== ctx.clientIdentity.getID()) {
            throw new Error(`unauthorized access: you can't change account that doesn't belong to you`);
        }

        let accountTo = await this._getAccount(ctx, idTo);

        let balanceFrom = accountFrom.balance[currency] || 0
        let balanceTo = accountTo.balance[currency] || 0

        if (balanceFrom < amountToTransfer) {
            throw new Error(`amount to transfer cannot be more than the current account balance`);
        }

        accountFrom.balance[currency] = balanceFrom - amountToTransfer
        accountTo.balance[currency] = balanceTo + amountToTransfer

        await this._putAccount(ctx, accountFrom);
        await this._putAccount(ctx, accountTo);
    }

    async balance(ctx, userID) {
        if (!(await this._accountExists(ctx, userID))) {
            throw new Error(`can not find account ${userID}`);
        }
        let account = await this._getAccount(ctx, userID);
        if (account.owner !== ctx.clientIdentity.getID()) {
            throw new Error(`unauthorized access: you can't get balance info from a account that doesn't belong to you`);
        }

        const currencyData = await ctx.stub.getState(currencyListKey);
        if (!currencyData || currencyData.length === 0) {
            return "[]"
        }
        let currencyList = JSON.parse(currencyData.toString());

        let balanceList = currencyList.map(info => {
            return {
                currency: info.currency,
                balance: account.balance[info.currency] || 0
            }
        })
        return JSON.stringify(balanceList);
    }

    async exchangeCurrency(ctx, userID, currencyFrom, currencyTo, amountFrom, amountTo) {
        if (!(await this._accountExists(ctx, userID))) {
            throw new Error(`can not find account ${userID}`);
        }
        let account = await this._getAccount(ctx, userID);
        if (account.owner !== ctx.clientIdentity.getID()) {
            throw new Error(`unauthorized access: you can't change account that doesn't belong to you`);
        }
        let _amountFrom = parseFloat(amountFrom);
        if (_amountFrom < 0) {
            throw new Error(`amountFrom cannot be negative`);
        }
        let _amountTo = parseFloat(amountTo);
        if (_amountTo < 0) {
            throw new Error(`amountTo cannot be negative`);
        }
        if (_amountFrom == 0 && _amountTo == 0) {
            throw new Error(`either amountTo or amountFrom should > 0`);
        }

        const currencyFromInfo = await this._getCurrency(ctx, currencyFrom)
        const currencyToInfo = await this._getCurrency(ctx, currencyTo)

        if (_amountFrom > 0) {
            // calculate the amount in currencyTo.
            let usdValue = _amountFrom * currencyFromInfo.exchangeRateToUSD
            _amountTo = usdValue / currencyToInfo.exchangeRateToUSD
        } else {
            // _amountTo > 0
            // calculate the amount in currencyFrom.
            let usdValue = _amountTo * currencyToInfo.exchangeRateToUSD
            _amountFrom = usdValue / currencyFromInfo.exchangeRateToUSD
        }

        let balanceFrom = account.balance[currencyFrom] || 0
        let balanceTo = account.balance[currencyTo] || 0
        if (balanceFrom < _amountFrom) {
            throw new Error(`Current balance in ${currencyFrom} is insufficient to pay the exchange`);
        }

        balanceFrom -= _amountFrom;
        balanceTo += _amountTo;

        // save balance.
        account.balance[currencyFrom] = balanceFrom;
        account.balance[currencyTo] = balanceTo;
        await this._putAccount(ctx, account);

        return JSON.stringify({
            amountFrom: _amountFrom,
            amountTo: _amountTo,
            balanceOfCurrencyFrom: balanceFrom,
            balanceOfCurrencyTO: balanceTo
        }); 
    }

    // Public API
    async currencyList(ctx) {
        const data = await ctx.stub.getState(currencyListKey);
        if (!data || data.length === 0) {
            return "[]"
        }
        return data.toString();
    }


    // private functions

    async _accountExists(ctx, id) {
        const compositeKey = ctx.stub.createCompositeKey(accountObjType, [id]);
        const accountBytes = await ctx.stub.getState(compositeKey);
        return accountBytes && accountBytes.length > 0;
    }


    async _getAccount(ctx, id) {
        const compositeKey = ctx.stub.createCompositeKey(accountObjType, [id]);

        const accountBytes = await ctx.stub.getState(compositeKey);
        if (!accountBytes || accountBytes.length === 0) {
            throw new Error(`the account ${id} does not exist`);
        }

        return JSON.parse(accountBytes.toString());
    }

    async _putAccount(ctx, account) {
        const compositeKey = ctx.stub.createCompositeKey(accountObjType, [account.id]);
        await ctx.stub.putState(compositeKey, Buffer.from(JSON.stringify(account)));
    }

    async _currencyExists(ctx, currency) {
        const data = await ctx.stub.getState(currencyListKey);
        if (!data || data.length === 0) {
            return false
        }
        let currencyList = JSON.parse(data.toString());
        let exists = false;
        currencyList.forEach(_currencyInfo => {
            if (_currencyInfo.currency == currency) {
                exists = true;
            }
        });
        return exists;
    }

    async _getCurrency(ctx, currency) {
        const data = await ctx.stub.getState(currencyListKey);
        if (!data || data.length === 0) {
            throw new Error(`the currency ${currency} does not exist`);
        }
        let currencyList = JSON.parse(data.toString());
        let currencyInfo = undefined;
        currencyList.forEach(_currencyInfo => {
            if (_currencyInfo.currency == currency) {
                currencyInfo = _currencyInfo;
            }
        });
        if (currencyInfo == undefined) {
            throw new Error(`the currency ${currency} does not exist`);
        }
        return currencyInfo;
    }

    async _putCurrency(ctx, info) {
        let currencyList = []
        const data = await ctx.stub.getState(currencyListKey);
        if (data.length > 0) {
            currencyList = JSON.parse(data.toString())
        }
        let index = -1;
        currencyList.forEach((_currencyInfo, _index)=> {
            if (_currencyInfo.currency == info.currency) {
                index = _index;
            }
        });
        if (index < 0) {
            currencyList.push(info)
        } else {
            currencyList[index] = info
        }
        await ctx.stub.putState(currencyListKey, Buffer.from(JSON.stringify(currencyList)));
    }
}

module.exports = ChainCode;